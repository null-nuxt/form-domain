import type { AnyFields } from '#forms'

/**
 * The project decides what reaches its components. Here, `meta.mask` becomes the
 * `mask` prop SimpleInput declares, and the message a session wrote on the field
 * becomes `errorMessage` — because that is what this project's input calls it.
 *
 * A field without a mask, or without a message, gets neither: nothing is emitted
 * by default, so a plain `<input>` never collects a stray attribute.
 */
export default defineNuxtPlugin(() => {
  extendFormBindings(field => ({
    ...(typeof field.meta?.mask === 'string' ? { mask: field.meta.mask } : {}),
    ...(field.error ? { errorMessage: field.error } : {}),
  }))
})

declare module '#forms' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface CustomFieldBindings<F extends AnyFields, K extends keyof F> {
    mask?: string
    errorMessage?: string
  }
}
