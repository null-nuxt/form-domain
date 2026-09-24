/**
 * The project decides what reaches its components. Here, `meta.mask` becomes the
 * `mask` prop SimpleInput declares, and the message a session wrote on the field
 * becomes `errorMessage` — because that is what this project's input calls it.
 *
 * A field with neither gets neither: `undefined` is "nothing to add", so this
 * can be written as the plain object it is.
 */
export default defineNuxtPlugin(() => {
  extendFormBindings(field => ({
    mask: field.meta?.mask,
    errorMessage: field.error,
    loading: field.loadingOptions,
  }))
})

declare module '#forms' {
  interface CustomFieldBindings {
    mask?: string
    errorMessage?: string
    loading?: boolean
  }
}
