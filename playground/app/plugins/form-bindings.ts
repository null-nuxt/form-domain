/**
 * The project decides what reaches its components. Here, `meta.mask` becomes the
 * `mask` prop SimpleInput declares, the message a session wrote on the field
 * becomes `errorMessage`, and the way a session hears that a field was visited
 * becomes `onBlur` — because those are the names this project's inputs use.
 *
 * A field with neither gets neither: `undefined` is "nothing to add", so this
 * can be written as the plain object it is.
 */
export default defineNuxtPlugin(() => {
  extendFormBindings(field => ({
    mask: field.meta?.mask,
    errorMessage: field.error,
    loading: field.loadingOptions,
    // what this project's inputs emit when they are left
    onBlur: field.touch,
  }))
})

declare module '#forms' {
  interface CustomFieldBindings {
    mask?: string
    errorMessage?: string
    loading?: boolean
    onBlur?: () => void
  }
}
