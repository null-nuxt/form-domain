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
export interface PerRequest<T> {
  (): T
  /**
   * The same thing, on an app that is not ours: what the Nuxt DevTools panel
   * needs, since it runs in an iframe with a Nuxt app of its own and the form
   * it is showing belongs to the page underneath.
   */
  from: (app: Record<string, unknown> | null | undefined) => T | undefined
}

export const perRequest = <T>(key: string, create: () => T): PerRequest<T> => {
  const standalone = create()

  const get = () => {
    const nuxtApp = tryUseNuxtApp() as Record<string, unknown> | null | undefined
    if (!nuxtApp) return standalone

    nuxtApp[key] ??= create()
    return nuxtApp[key] as T
  }

  get.from = (app: Record<string, unknown> | null | undefined) => app?.[key] as T | undefined

  return get
}
