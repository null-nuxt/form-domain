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
 * actually leaks is one fields object driving two forms — so that is what's
 * detected, at the moment it happens.
 */
const CLAIMED = Symbol.for('null-nuxt-form-domain:claimed')

interface Claimable {
  [CLAIMED]?: true
}

/**
 * Marks a fields object as driving a form, and warns if something already was.
 *
 * A warning rather than a throw: by the time this fires the app is running, and
 * turning a data leak into a blank page helps nobody. It is not gated to dev —
 * on the server this is exactly the line you want in the logs.
 */
export function claimFields(fields: object): void {
  const target = fields as Claimable

  if (target[CLAIMED]) {
    console.warn(
      '[@null-nuxt/form-domain] these fields already drive another form. '
      + 'Fields declared at module scope are created once per process, so under SSR '
      + 'the next request reuses the state the previous one filled in. '
      + 'Wrap them in a factory — `const createFields = () => refFields({ ... })` — '
      + 'and call it inside the setup, or inside the component.',
    )
    return
  }

  Object.defineProperty(target, CLAIMED, { value: true, enumerable: false, configurable: true })
}

/** Lets a form release its fields, so disposing and rebuilding doesn't warn. */
export function releaseFields(fields: object): void {
  // redefined rather than deleted: the lint rule against dynamic delete is
  // right in general, and writing `undefined` reads the same to the check
  Object.defineProperty(fields, CLAIMED, { value: undefined, enumerable: false, configurable: true })
}
