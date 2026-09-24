import { markRaw } from 'vue'
import { isStandardSchema } from '../standard'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { FieldObj, FieldRule } from './declare'
import type { AnyFields, FieldOption, HasOptions, OnlyKnownKeys, OptionValue, ValuesOf } from '../types'

/**
 * Two rules for the same field is almost always a copy-paste, not intent —
 * and with the registration callable any number of times it stops being
 * impossible the way `withRules({...})` made it. Loud in dev, last-write-wins
 * in production so a warning never breaks a page.
 */
const warnIfTaken = (slot: 'rule' | 'schema', key: string, taken: boolean) => {
  if (!taken || !import.meta.dev) return

  console.warn(
    `[@null-nuxt/form-domain] field "${key}" already had a ${slot}; the later one replaces it. `
    + `Declaring the same field in two places is usually a copy-paste.`,
  )
}

/**
 * Behaviour for one field. The field is the argument, so nothing has to know
 * which form is "current" — which is what keeps this callable from anywhere,
 * including another file, without the hazards an ambient registry brings.
 *
 * `deriveOptions` is gated the same way the keyed form gates it: the field has
 * to have declared `options`. Reading it off the target's declaration rather
 * than off a fields object is the only difference — the same mistake must not
 * compile through one form and fail through the other.
 */
export function addRule<TValue, TValues, TDeclared>(
  target: FieldObj<TValue, TValues, TDeclared>,
  rule: Omit<FieldRule<TValue, TValues>, 'deriveOptions' | 'loadOptions'>
    & ('options' extends keyof NonNullable<TDeclared>
      ? {
          deriveOptions?: () => ReadonlyArray<FieldOption<OptionValue<TValue>>>
          loadOptions?: () => Promise<ReadonlyArray<FieldOption<OptionValue<TValue>>>>
        }
      : { deriveOptions?: never, loadOptions?: never }),
): void {
  warnIfTaken('rule', target.key, target.rule !== undefined)
  target.rule = rule as FieldRule<TValue, TValues>
}

/**
 * Behaviour for several fields at once, keyed by name.
 *
 * The object is a DIRECT argument rather than something returned, which is
 * what puts the compiler's finger on the offending key: from an arrow's return
 * the same check still fires, but the error lands on the whole function.
 */
/**
 * The rule a given field accepts. `deriveOptions` is only among them when the
 * field declared `options` in the first place — deriving a list for something that
 * never said it was a select is a mistake the types can catch, and requiring the
 * declaration is also what lets `form.options` and `form.selected` be keyed by
 * the fields that can hold a choice.
 */
export type RuleFor<F extends AnyFields, K extends keyof F> =
  Omit<FieldRule<F[K]['value'], ValuesOf<F>>, 'deriveOptions' | 'loadOptions'>
  & (HasOptions<F, K> extends true
    ? {
        deriveOptions?: () => ReadonlyArray<FieldOption<OptionValue<F[K]['value']>>>
        loadOptions?: () => Promise<ReadonlyArray<FieldOption<OptionValue<F[K]['value']>>>>
      }
    : { deriveOptions?: never, loadOptions?: never })

export function addRules<F extends AnyFields, R>(
  fields: F,
  rules: R
    & { [K in keyof F]?: RuleFor<F, K> }
    & OnlyKnownKeys<R, keyof F & string>,
): void {
  for (const [key, rule] of Object.entries(rules as Record<string, unknown>)) {
    const target = fields[key]
    if (target && rule) addRule(target, rule as FieldRule<unknown, unknown>)
  }
}

/** A validator, or a getter for one when it depends on the form's state. */
export type SchemaSource = StandardSchemaV1 | (() => StandardSchemaV1)

export function addSchema<TValue, TValues>(
  target: FieldObj<TValue, TValues>,
  schema: SchemaSource,
): void {
  warnIfTaken('schema', target.key, target.schema !== undefined)
  /**
   * Kept raw: the field is reactive, and a validator stored on it would come back
   * as a deep proxy. Zod 4 keeps its internals on a read-only, non-configurable
   * property, and a proxy handing back anything but the original value there
   * breaks a Proxy invariant — every validation throws. A getter is left alone:
   * functions aren't proxied, and what it returns is built fresh each time. Told
   * apart by the spec's marker, not by being a function: some schemas are.
   */
  target.schema = isStandardSchema(schema) ? markRaw(schema) : schema
}

/**
 * Validation for several fields. Pass a getter for the ones that depend on
 * state — a plain validator is read once, which is the right thing when it
 * never changes and the wrong thing when it does.
 */
export function addSchemas<F extends AnyFields, S>(
  fields: F,
  schemas: S
    & { [K in keyof F]?: SchemaSource }
    & OnlyKnownKeys<S, keyof F & string>,
): void {
  for (const [key, schema] of Object.entries(schemas as Record<string, unknown>)) {
    const target = fields[key]
    if (target && schema) addSchema(target, schema as SchemaSource)
  }
}
