import { tryUseNuxtApp } from '#imports'

/**
 * Something kept per request.
 *
 * Under SSR one process serves every user, so anything holding a form's state
 * in a module variable hands the next request what the last one filled in. The
 * Nuxt app instance is what a request has of its own, so that is where it goes.
 *
 * Outside Nuxt — unit tests — there is no request to isolate, and a single
 * value for the process is the honest answer rather than a fake one.
 */
export const perRequest = <T>(key: string, create: () => T): (() => T) => {
  const standalone = create()

  return () => {
    const nuxtApp = tryUseNuxtApp() as Record<string, unknown> | null | undefined
    if (!nuxtApp) return standalone

    nuxtApp[key] ??= create()
    return nuxtApp[key] as T
  }
}
