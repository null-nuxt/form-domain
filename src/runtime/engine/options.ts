import { watchEffect } from 'vue'
import type { AnyFields, FieldOption } from '../types'

/** Whatever the field holds, as the list would have to carry it. */
const chosen = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value])

/**
 * Drops what the new list no longer offers.
 *
 * A value the list cannot match is the failure the option check exists to
 * prevent: the select renders choices that never match, `selected` resolves to
 * nothing, and a `oneOf` schema rejects what the user is looking at. Better
 * empty and asked for again.
 */
const dropWhatIsGone = (
  field: { value: unknown },
  list: ReadonlyArray<FieldOption<unknown>>,
) => {
  const offered = new Set(list.map(option => option.value))

  if (Array.isArray(field.value)) {
    const kept = field.value.filter(entry => offered.has(entry))
    if (kept.length !== field.value.length) field.value = kept
    return
  }

  const [value] = chosen(field.value)
  if (value === undefined || value === null || value === '') return
  if (!offered.has(value)) field.value = Array.isArray(field.value) ? [] : ''
}

/**
 * Runs each field's `loadOptions`, and keeps running it.
 *
 * The call happens inside a tracked effect, so whatever the function reads
 * before its first `await` is what re-runs it — a state field, a step, a query.
 * That is `watchEffect`'s own rule, and it is why fetching a list needs no
 * dependency declared anywhere.
 *
 * Everything else here is about answers arriving out of order: a ticket per
 * field, so a slow reply about an old question loses to a newer one, and a
 * rejection that leaves the previous list where it was rather than emptying a
 * select because the network blinked.
 */
export const loadOptionsFor = (fields: AnyFields, keys: readonly string[]): void => {
  for (const key of keys) {
    const field = fields[key]!
    if (!field.rule?.loadOptions) continue

    if (field.rule.deriveOptions && import.meta.dev) {
      console.warn(
        `[@null-nuxt/form-domain] field "${key}" has both \`deriveOptions\` and \`loadOptions\`; `
        + `the derived list wins. One of them is not doing anything.`,
      )
    }

    let latest = 0

    watchEffect(async () => {
      const load = field.rule?.loadOptions
      if (!load) return

      const ticket = ++latest
      field.loadingOptions = true

      try {
        // read synchronously by `load` before its await: that is the dependency
        const list = await load()
        if (ticket !== latest) return

        field.loadedOptions = list
        dropWhatIsGone(field, list)
      }
      catch (error) {
        if (ticket !== latest) return

        // the list it had is better than none: a blink should not empty a select
        if (import.meta.dev) console.warn(`[@null-nuxt/form-domain] loading the options of "${key}" failed.`, error)
      }
      finally {
        if (ticket === latest) field.loadingOptions = false
      }
    })
  }
}
