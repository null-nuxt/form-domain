import { getFormRegistry } from './domain/registry'
import { releaseSession } from './session/create'

/**
 * A form built for one test.
 *
 * A domain is a singleton by design — `defineStore`'s bargain, and what lets two
 * components fill in the same form — so the second test to ask for it would get
 * whatever the first one typed. This forgets it first, which is the whole reason
 * this function exists instead of calling the domain directly.
 *
 * What comes back is the instance, so everything a test wants is already on it:
 * `set`, `validate`, `values`, `payload`, `fields`, `register`, and `dispose` for
 * when the test is over. The domain keeps returning this same one, so whatever is
 * under test sees the form the test is holding.
 */
export const createTestForm = <D extends { id: string } & (() => unknown)>(domain: D): ReturnType<D> => {
  forgetForm(domain.id)

  return domain() as ReturnType<D>
}

/**
 * Drops one domain's instance: its effects stopped, its session released, and
 * the next build starting from the declaration.
 */
export const forgetForm = (id: string): void => {
  const registry = getFormRegistry()
  const instance = registry.get(id) as { fields?: object, dispose?: () => void } | undefined

  if (instance?.fields) releaseSession(instance as { fields: object })
  instance?.dispose?.()
  registry.delete(id)
}

/**
 * Every domain forgotten — `afterEach(resetForms)` is the whole isolation story
 * for a suite that touches more than one.
 *
 * Outside Nuxt there is no request to scope state to, so a module-level registry
 * is what a test shares with the next one. Nothing here reaches into a running
 * app: it clears the registry of whichever context is asking.
 */
export const resetForms = (): void => {
  for (const id of [...getFormRegistry().keys()]) forgetForm(id)
}

/**
 * Waits for the form to settle.
 *
 * `nextTick()` is enough for what a patch writes, but not for a rule that went
 * and asked something — a fetched option list, a postcode lookup — because the
 * handler only resumes once its promise does. A macrotask is past both, and it
 * is what this package's own tests wait on.
 */
export const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))
