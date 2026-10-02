import { markRaw } from 'vue'
import { isStandardSchema } from '../standard'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { FieldObj, FieldRule, GroupRule } from './declare'
import { isClaimed } from '../engine/claim'
import { scopeMapOf } from './scope'
import type { ScopeMap } from './scope'
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
  warnIfLate(target, rule as FieldRule<unknown, unknown>)

  target.rule = rule as FieldRule<TValue, TValues>
}

/**
 * The parts of a rule the engine WIRES rather than asks.
 *
 * `canShow` and the rest are read whenever the answer is needed, so attaching
 * them late works. `onChange` and `loadOptions` are watchers, and the engine
 * creates them when it is built — attached afterwards they are never wired, and
 * a lookup that simply never runs is the hardest kind of nothing to debug.
 */
const warnIfLate = (target: { key: string } & object, rule: FieldRule<unknown, unknown>) => {
  if (!rule.onChange && !rule.loadOptions) return
  if (!isClaimed(target)) return

  console.warn(
    `[@null-nuxt/form-domain] the rule for "${target.key}" was attached after the form was built, `
    + `so its \`${rule.onChange ? 'onChange' : 'loadOptions'}\` will never run. Attach rules while the `
    + `fields are still a declaration — inside the setup, before \`toForm()\`.`,
  )
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

/**
 * A key the types could not check, named for a field that is not there.
 *
 * It happens where the fields arrive wider than they really are — a fragment's
 * rules written against its four keys, applied to a form that took two of them.
 * Skipped in silence, the fragment promises validation that was never attached
 * and nothing says so until the form accepts something it should not. Not gated
 * to dev for that reason: a validator that never ran is worth a line in the
 * server's log too.
 */
const warnIfMissing = (what: 'rule' | 'schema', key: string, present: boolean) => {
  if (present) return

  console.warn(
    `[@null-nuxt/form-domain] no field named "${key}" here, so its ${what} was not attached. `
    + `A fragment's rules name the keys it declared — check the form has them, `
    + `or that the names were not renamed by \`prefixFields\`.`,
  )
}

/**
 * The only part of a rule that says a key out loud.
 *
 * Everything else a rule does — `canShow`, `deriveOptions`, `loadOptions` — reads
 * the field objects it was handed, and a scoped view hands over the real ones. So
 * a fragment's rules work on a renamed form as written, except where they name a
 * key: `patch({ street })` and `busy('city')`. Translated here, where the view's
 * key space is still known; the engine only ever sees the form's own names.
 */
const throughScope = (rule: FieldRule<unknown, unknown>, scope: ScopeMap): FieldRule<unknown, unknown> => {
  const { onChange } = rule
  if (!onChange) return rule

  const real = (key: string) => scope[key] ?? key

  return {
    ...rule,
    onChange: (value, ctx) => onChange(value, {
      patch: patch => ctx.patch(
        Object.fromEntries(Object.entries(patch).map(([key, next]) => [real(key), next])),
      ),
      // `FieldRule<unknown, unknown>` leaves the key type `never`; the names are the view's
      busy: (...keys) => ctx.busy(...(keys.map(real) as never[])),
    }),
  }
}

export function addRules<F extends AnyFields, R>(
  fields: F,
  rules: R
    & { [K in keyof F]?: RuleFor<F, K> }
    & OnlyKnownKeys<R, keyof F & string>,
): void {
  const scope = scopeMapOf(fields)

  for (const [key, rule] of Object.entries(rules as Record<string, unknown>)) {
    const target = fields[key]
    warnIfMissing('rule', key, target !== undefined)

    if (!target || !rule) continue

    const attached = rule as FieldRule<unknown, unknown>
    addRule(target, scope ? throughScope(attached, scope) : attached)
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
    warnIfMissing('schema', key, target !== undefined)

    if (target && schema) addSchema(target, schema as SchemaSource)
  }
}

/**
 * One rule for several fields at once — a section of the form that applies only
 * sometimes, or is filled in by something else.
 *
 * The target is the fields it covers: a list of keys, or a declaration fragment,
 * in which case every field in the fragment is in the group. The fragment is
 * worth preferring where there is one, because then membership follows the
 * declaration: a field added to it joins the group without anyone remembering
 * to say so.
 *
 * It does not replace what a field says about itself. A field's own rule and
 * every group it belongs to all have to agree before it shows, so "the address
 * section is for companies" and "the complement only applies to flats" can both
 * be true without either being written twice.
 */
export function addGroupRule<F extends AnyFields>(
  fields: F,
  keys: ReadonlyArray<keyof F & string>,
  rule: GroupRule,
): void
export function addGroupRule<F extends AnyFields, T>(
  fields: F,
  fragment: T & OnlyKnownKeys<T, keyof F & string>,
  rule: GroupRule,
): void
export function addGroupRule(
  fields: AnyFields,
  target: ReadonlyArray<string> | object,
  rule: GroupRule,
): void {
  /**
   * A scoped view is a fragment of the form's own fields under the fragment's
   * names, so its keys are translated the way a rule's are — which is what lets
   * `addGroupRule(fields, scopeOf(address, fields, 'company'), …)` cover the
   * company block and not the other one.
   */
  const scope = Array.isArray(target) ? undefined : scopeMapOf(target)
  const named = Array.isArray(target) ? target : Object.keys(target)
  const keys = scope ? named.map(key => scope[key] ?? key) : named

  for (const key of keys) {
    const field = fields[key]
    warnIfMissing('rule', key, field !== undefined)

    if (!field) continue

    // replaced rather than pushed into, so the reactive write reaches what is watching
    field.groups = [...(field.groups ?? []), rule]
  }
}
