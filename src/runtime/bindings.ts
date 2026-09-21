import { tryUseNuxtApp } from '#imports'
import type { FieldObj } from './field'

/**
 * The keys that make `v-bind="register(key)"` a working v-model. Returning one
 * from an extender is a compile error, and ignored at runtime: replacing the
 * handler used to stop typing from reaching the field, in silence.
 */
export const CONTRACT_KEYS = ['name', 'modelValue', 'onUpdate:modelValue'] as const

export type ContractKey = typeof CONTRACT_KEYS[number]

/**
 * Adds keys to what `register()` hands a component, or overrides the defaults —
 * `label`, `placeholder`, `options`. Receives the field, `meta` included, and its
 * key; returning nothing adds nothing. The v-model contract is not overridable.
 *
 * This is how a project maps its own conventions onto its components: the engine
 * never interprets `meta`, because what `meta.mask` means is a question about the
 * project's inputs, not about the form.
 */
export type FormBindingsExtender = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  field: FieldObj<any>,
  context: { key: string },
) => (Record<string, unknown> & { [K in ContractKey]?: never }) | undefined

const EXTENDERS_KEY = '__nuxt_forms_bindings__'

/** Outside Nuxt (unit tests) there is no request to isolate. */
const standaloneExtenders: FormBindingsExtender[] = []

/**
 * Per request under SSR, like the registry. A plugin runs once per request, so a
 * module-level list would collect one more copy of the same extender every time.
 */
export const getBindingExtenders = (): FormBindingsExtender[] => {
  const nuxtApp = tryUseNuxtApp() as Record<string, unknown> | null | undefined
  if (!nuxtApp) return standaloneExtenders

  nuxtApp[EXTENDERS_KEY] ??= []
  return nuxtApp[EXTENDERS_KEY] as FormBindingsExtender[]
}

/**
 * Registers an extender — call it from a plugin. Returns the function that removes it.
 *
 * The runtime half only. For `register()` to be TYPED with the new keys, augment
 * `CustomFieldBindings` from `#forms` too.
 */
export function extendFormBindings(extend: FormBindingsExtender): () => void {
  const extenders = getBindingExtenders()
  extenders.push(extend)

  return () => {
    const index = extenders.indexOf(extend)
    if (index !== -1) extenders.splice(index, 1)
  }
}
