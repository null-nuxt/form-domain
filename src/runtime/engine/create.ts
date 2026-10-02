import { computed, watch } from 'vue'
import { shapeOf, validateShape } from './validate'
import { clearsWhenHidden, isEditable, isVisible } from './visibility'
import { loadOptionsFor } from './options'
import { claimFields, releaseFields } from './claim'
import { CONTRACT_KEYS, getBindingExtenders } from './bindings'
import type { FieldValidationResult, ValidationResult } from '../standard'
import type { AnyFields, FieldOption, FormEngine, OptionValue, SelectedOptions, ValuesOf } from '../types'

/**
 * An extender that returns a contract key has it ignored, which is its own kind
 * of silent. Said out loud in dev, so the project finds out it asked for nothing.
 */
const warnIfContractOverridden = (key: string, bindings: Record<string, unknown>) => {
  if (!import.meta.dev) return

  const overridden = CONTRACT_KEYS.filter(contractKey => contractKey in bindings)
  if (overridden.length === 0) return

  console.warn(
    `[@null-nuxt/form-domain] an extender returned ${overridden.map(k => `\`${k}\``).join(', ')} `
    + `for field "${key}". Those make up the v-model contract and are ignored — adapt the `
    + `component instead if it needs a different one.`,
  )
}

/**
 * Everything derived from a fields object, once the rules and validators have
 * been attached to it.
 *
 * The engine reads the fields; it never owns them. That's what lets the same
 * engine serve a form assembled inside a component and one assembled inside a
 * domain's setup.
 */
export function createEngine<F extends AnyFields>(fields: F): FormEngine<F> {
  claimFields(fields)

  // read now, in setup: `register()` runs during render, where the Nuxt app may not be reachable
  const extenders = getBindingExtenders()

  const keys = Object.keys(fields)

  const values = computed(() => {
    const result: Record<string, unknown> = {}
    for (const key of keys) result[key] = fields[key]!.value
    return result as ValuesOf<F>
  })

  const canShow = computed(() => {
    const result: Record<string, boolean> = {}
    for (const key of keys) result[key] = isVisible(fields[key]!)
    return result as { [K in keyof F]: boolean }
  })

  /** Shown, but not to be typed in — a value something else decides. */
  const canEdit = computed(() => {
    const result: Record<string, boolean> = {}
    for (const key of keys) result[key] = isEditable(fields[key]!)

    return result as { [K in keyof F]: boolean }
  })

  const visible = computed(() => {
    const result: Record<string, unknown> = {}
    for (const key of keys) {
      if (canShow.value[key] !== false) result[key] = fields[key]!.value
    }
    return result as Partial<ValuesOf<F>>
  })

  /**
   * Only the fields that declared `options`. Keyed the same way as the type, so
   * a text input is neither typed nor listed as though it held a choice.
   */
  const optionKeys = keys.filter(key => fields[key]!.declaredOptions !== undefined)

  const selected = computed(() => {
    const result: Record<string, unknown> = {}
    for (const key of optionKeys) result[key] = fields[key]!.selected
    return result as SelectedOptions<F>
  })

  loadOptionsFor(fields, optionKeys)

  const options = computed(() => {
    const result: Record<string, ReadonlyArray<FieldOption<unknown>>> = {}
    for (const key of optionKeys) {
      const target = fields[key]!
      // a rule's list wins over the declared one, derived before fetched
      result[key] = target.rule?.deriveOptions
        ? target.rule.deriveOptions()
        : (target.loadedOptions ?? target.declaredOptions ?? [])
    }
    return result as { [K in keyof F]: ReadonlyArray<FieldOption<OptionValue<F[K]['value']>>> }
  })

  const initialValues = Object.fromEntries(keys.map(key => [key, fields[key]!.value]))

  /**
   * Clears whatever got hidden. `canShow` already stated the condition;
   * repeating it in an `onChange` is the duplication this engine exists to
   * avoid, and it's easy to get the empty value wrong.
   */
  watch(canShow, (current, previous) => {
    for (const key of keys) {
      if (current[key] !== false || previous?.[key] === false) continue

      // asked for by whatever is hiding it, which is not the same as by anything attached to it
      const field = fields[key]!
      if (clearsWhenHidden(field)) field.value = initialValues[key]
    }
  })

  /**
   * Only the visible fields' validators. A hidden field isn't validated —
   * that's what erases most `.when()` calls, since the condition was already
   * stated once in `canShow`.
   */
  const shape = computed(() => shapeOf(fields, keys))

  /**
   * Composition stays the project's call — the engine has no idea whether
   * `object` or `z.object` is right — but the reactivity doesn't: wrapping it
   * here keeps a hidden field from staying required in a schema composed once
   * and never again.
   */
  const composeSchema = (combine: (shape: never) => unknown) =>
    computed(() => combine(shape.value as never))

  /**
   * The whole form, or only the keys asked for — a step's, before a wizard
   * advances. Either way it is the same `shape`, so a subset cannot come to a
   * different conclusion about what is required than the submit will.
   */
  const validate = (subset?: readonly string[]): Promise<ValidationResult<ValuesOf<F>>> =>
    validateShape(subset ? shapeOf(fields, subset) : shape.value, fields)

  /**
   * One field, for validating as the user leaves it. Expressed through
   * `validate` rather than reaching for the field's own validator, so blur and
   * submit resolve visibility and the getter form the same way.
   */
  const validateField = async (key: string): Promise<FieldValidationResult> => {
    const { valid, errors } = await validate([key])
    return { valid, errors: errors[key] ?? [] }
  }

  const set = (patch: Partial<ValuesOf<F>>) => {
    for (const [key, next] of Object.entries(patch as Record<string, unknown>)) {
      if (key in fields) {
        fields[key]!.value = next
        continue
      }

      /**
       * Said rather than skipped. The types answer this wherever the keys are
       * known; where they are not, a patch naming a field the form does not have
       * wrote nothing and said nothing — and the likeliest reason is a fragment's
       * rule patching its own names on a form that renamed them, which is what
       * `scopeOf` is for.
       */
      console.warn(
        `[@null-nuxt/form-domain] set: this form has no field named "${key}", so it was not written. `
        + `A fragment's rule patches the keys it declared — attach it through \`scopeOf\` `
        + `when the form renamed them.`,
      )
    }
  }

  for (const key of keys) {
    const onChange = fields[key]!.rule?.onChange
    if (!onChange) continue

    /** Discards a stale response from an async `onChange`. */
    let latest = 0

    watch(
      () => fields[key]!.value,
      async (value) => {
        const ticket = ++latest

        /**
         * What this run is holding busy, so it is freed whatever happens — a
         * throw included. Counted on the field, because another handler may be
         * holding the same one.
         */
        const held = new Set<string>()

        const hold = (...names: string[]) => {
          for (const name of names) {
            const target = fields[name]
            if (!target || held.has(name)) continue

            held.add(name)
            target.busyMarks = (target.busyMarks ?? 0) + 1
          }
        }

        // the field whose handler is running is waiting on it without saying so
        hold(key)
        let running = true

        try {
          await onChange(value, {
            patch: (patch) => {
              // a request, not a write: a slow autofill must not overwrite what
              // the user typed in the meantime
              if (ticket === latest) set(patch as Partial<ValuesOf<F>>)
            },
            // ignored once the handler settled: there would be nothing left to free it
            busy: (...names: string[]) => {
              if (running) hold(...names)
            },
          })
        }
        catch (error) {
          /**
           * Nobody is awaiting this. A watcher's callback is called by Vue and
           * its rejection belongs to no one, so a handler that threw used to
           * leave an unhandled rejection naming neither the field nor the rule —
           * and in a test run it takes the whole suite down.
           *
           * Reported rather than warned, and not only in dev, unlike the same
           * case in `loadOptions`: that one has something to fall back on — the
           * list it already had — and this one has nothing. Whatever the user
           * should see about it is the handler's own business, inside its own
           * try.
           */
          console.error(`[@null-nuxt/form-domain] the onChange of "${key}" threw.`, error)
        }
        finally {
          running = false

          for (const name of held) {
            const target = fields[name]!
            target.busyMarks = Math.max(0, (target.busyMarks ?? 1) - 1)
          }
        }
      },
    )
  }

  return {
    fields,
    values,
    visible,
    canShow,
    canEdit,
    selected,
    options,
    shape,
    composeSchema,
    validate,
    validateField,
    set,
    reset: () => {
      for (const key of keys) fields[key]!.value = initialValues[key]
    },
    dispose: () => releaseFields(fields),
    register: (key: string) => {
      const target = fields[key]!
      const list = options.value[key]

      const editable = isEditable(target)

      const bindings: Record<string, unknown> = {
        label: target.label,
        // only when it is locked: a field nobody locked says nothing about it
        ...(editable ? {} : { disabled: true }),
        // a field that declared options is a choice: its select needs the list even
        // while empty. Anything else gets no key, or it lands as a DOM attribute.
        ...(list ? { options: list } : {}),
        ...(target.placeholder ? { placeholder: target.placeholder } : {}),
      }

      /**
       * The project's own keys: an extender may add keys or override the
       * defaults above. `undefined` means it had nothing to add for this field,
       * not that a default should go away — which is what lets an extender be
       * written as a plain object instead of a spread of conditionals.
       */
      for (const extend of extenders) {
        const added = extend(target, { key })
        if (!added) continue

        for (const [prop, value] of Object.entries(added)) {
          if (value !== undefined) bindings[prop] = value
        }
      }

      warnIfContractOverridden(key, bindings)

      /**
       * The v-model contract goes on LAST, so no extender can replace it. These are
       * what make `v-bind` a working v-model; an extender returning its own handler
       * used to win, and typing stopped reaching the field in silence.
       */
      return Object.assign(bindings, {
        name: key,
        modelValue: target.value,
        /**
         * Whatever the component emits is what the field stores, `undefined`
         * included: a component written with `defineModel<string>()` emits the
         * wider type, and the binding has to accept it to be assignable.
         */
        'onUpdate:modelValue': (next: unknown) => {
          // locked means locked, whether or not the component honoured the prop
          if (!isEditable(target)) return

          target.value = next
        },
      })
    },
    // the bindings are assembled loosely; FieldBindings is the contract they're typed against
  } as unknown as FormEngine<F>
}
