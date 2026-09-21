import { tryUseNuxtApp } from '#imports'

const REGISTRY_KEY = '__nuxt_forms__'

/** Outside Nuxt (unit tests) there is no request to isolate: a map is enough. */
const standaloneRegistry = new Map<string, unknown>()

/**
 * Instances live per request under SSR — keeping them in a module variable
 * would leak one user's data into the next request.
 */
export const getFormRegistry = (): Map<string, unknown> => {
  const nuxtApp = tryUseNuxtApp() as Record<string, unknown> | null | undefined
  if (!nuxtApp) return standaloneRegistry

  nuxtApp[REGISTRY_KEY] ??= new Map<string, unknown>()
  return nuxtApp[REGISTRY_KEY] as Map<string, unknown>
}
