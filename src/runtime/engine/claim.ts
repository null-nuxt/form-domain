import { isField } from '../fields/declare'
import type { AnyFields } from '../types'

/**
 * Fields are reactive state. Declared at module scope they are created once per
 * process, so on the server the second request drives the same objects the
 * first one filled in — one user's data showing up in another's form.
 *
 * The types can't see this: whether `refFields()` runs at module scope or inside a
 * factory is not something a signature can express. So it is caught at runtime,
 * and caught on the condition that IS the bug rather than on a proxy for it.
 *
 * "Was there an active effect scope when the fields were created?" is the
 * obvious check and the wrong one: it fires in tests and in any helper that
 * builds fields before handing them over, neither of which leaks anything. What
 * actually leaks is one field driving two forms — so that is what's detected,
 * at the moment it happens.
 */
const CLAIMED = Symbol.for('null-nuxt-form-domain:claimed')

interface Claimable {
  [CLAIMED]?: true
}

/**
 * Marks an object as driving a form. `false` means it already was.
 *
 * Not enumerable, so it stays out of `Object.entries` and of anything the
 * project serializes; configurable, so releasing can take it back off.
 */
const claim = (target: object): boolean => {
  if ((target as Claimable)[CLAIMED]) return false

  Object.defineProperty(target, CLAIMED, { value: true, enumerable: false, configurable: true })
  return true
}

const release = (target: object): void => {
  // redefined rather than deleted: the lint rule against dynamic delete is
  // right in general, and writing `undefined` reads the same to the check
  Object.defineProperty(target, CLAIMED, { value: undefined, enumerable: false, configurable: true })
}

/**
 * Marks a fields object and every field in it, and warns if something already
 * was driving a form.
 *
 * Both levels, because the container alone misses the case that composing makes
 * common: the same field object reaching two forms inside two different
 * records. Nothing about those records is shared, so checking them answers
 * nothing — the leak is the field, and the field is what gets marked.
 *
 * A warning rather than a throw: by the time this fires the app is running, and
 * turning a data leak into a blank page helps nobody. It is not gated to dev —
 * on the server this is exactly the line you want in the logs.
 */
export function claimFields(fields: AnyFields): void {
  if (!claim(fields)) {
    console.warn(
      '[@null-nuxt/form-domain] these fields already drive another form. '
      + 'Fields declared at module scope are created once per process, so under SSR '
      + 'the next request reuses the state the previous one filled in. '
      + 'Wrap them in a factory — `const createFields = () => refFields({ ... })` — '
      + 'and call it inside the setup, or inside the component.',
    )
    return
  }

  const shared: string[] = []
  for (const [key, field] of Object.entries(fields)) {
    if (isField(field) && !claim(field)) shared.push(key)
  }

  if (shared.length === 0) return

  console.warn(
    `[@null-nuxt/form-domain] ${shared.map(key => `\`${key}\``).join(', ')} already `
    + 'drive another form. A built field is reactive state, so two forms holding the same '
    + 'one write to the same value — and under SSR it outlives the request that filled it. '
    + 'Share the DECLARATION instead, which is plain data, and let each form build its own '
    + 'with `refFields()`.',
  )
}

/** Lets a form release its fields, so disposing and rebuilding doesn't warn. */
export function releaseFields(fields: AnyFields): void {
  release(fields)
  for (const field of Object.values(fields)) {
    if (isField(field)) release(field)
  }
}
