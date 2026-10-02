import type { BuiltFields, FieldsInput, Prefixed } from './declare'
import type { AnyFields } from '../types'

/** What `scopeOf` leaves on the view for `addRules` to read. Never enumerable. */
const SCOPE = '__formDomainScope'

/** The view key each real key answers to — `{ street: 'companyStreet' }`. */
export type ScopeMap = Readonly<Record<string, string>>

export const scopeMapOf = (fields: object): ScopeMap | undefined =>
  (fields as Record<string, ScopeMap | undefined>)[SCOPE]

/** The names a fragment's keys go under once a prefix was put in front of them. */
type ScopedKeys<T, P extends string> = P extends ''
  ? keyof T & string
  : keyof Prefixed<P, T> & string

/**
 * A fragment's own keys, over a form that renamed them.
 *
 * A fragment that brings rules writes them against the keys it declared —
 * `fields.zipCode`, `patch({ street })` — and `prefixFields` renames those. So
 * everything that came with the fragment had to be rewritten for the second copy:
 * the schemas, the derived lists, the key map a lookup patches through. That is
 * the one place left where a field name was typed out twice.
 *
 * This is the translation, done once:
 *
 * ```ts
 * const company = prefixFields(address, 'company')
 * const fields = refFields(mergeFields([base, company]))
 *
 * addressRules(scopeOf(address, fields, 'company'))
 * ```
 *
 * What comes back is the form's own fields under the fragment's names — the same
 * objects, so a rule reading `fields.zipCode.value` reads the real one. The form
 * has to have them: a prefix that does not line up is a compile error naming the
 * keys, not a view full of `undefined`.
 *
 * The prefix is passed rather than recovered from the fragment. A renamed
 * declaration could carry where it came from, hidden on the object, but hidden
 * state is lost the moment the fragment is spread into another one — which is how
 * every fragment reaches a form.
 */
export const scopeOf = <
  T extends FieldsInput,
  F extends AnyFields,
  P extends string = '',
>(
  fragment: T,
  fields: F & { [K in ScopedKeys<T, P>]: unknown },
  prefix?: P,
): BuiltFields<T> => {
  const view: Record<string, unknown> = {}
  const scope: Record<string, string> = {}

  for (const key of Object.keys(fragment)) {
    const real = prefix ? `${prefix}${key.charAt(0).toUpperCase()}${key.slice(1)}` : key

    if ((fields as AnyFields)[real] === undefined) {
      console.warn(
        `[@null-nuxt/form-domain] scopeOf: this form has no field named "${real}", `
        + `so "${key}" is a hole in the view. Check the prefix matches the one `
        + `\`prefixFields\` was given.`,
      )
    }

    view[key] = (fields as AnyFields)[real]
    scope[key] = real
  }

  /**
   * Not enumerable, so the view is still a plain record of fields to everything
   * that reads it — `Object.keys`, a spread, `addGroupRule` taking a fragment.
   */
  Object.defineProperty(view, SCOPE, { value: scope, enumerable: false })

  return view as BuiltFields<T>
}
