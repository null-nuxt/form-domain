import type { AnyFields } from '#forms'

/**
 * The project decides what `meta` means for its components. Here, `meta.mask`
 * becomes the `mask` prop SimpleInput declares — and fields without one get nothing.
 */
export default defineNuxtPlugin(() => {
  extendFormBindings(field =>
    typeof field.meta?.mask === 'string' ? { mask: field.meta.mask } : undefined,
  )
})

declare module '#forms' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface CustomFieldBindings<F extends AnyFields, K extends keyof F> {
    mask?: string
  }
}
