import { shallowReactive } from 'vue'
import { perRequest } from '../request'
import type { ComputedRef } from 'vue'

/** What a session shows about itself to anything watching — the inspector, today. */
export interface RegisteredSession {
  /** The domain it belongs to, when the form has an id. */
  id?: string
  attempts: ComputedRef<number>
  isSubmitting: ComputedRef<boolean>
  errors: ComputedRef<Record<string, string>>
  touched: ComputedRef<readonly string[]>
}

/**
 * The sessions alive right now, per request.
 *
 * A session belongs to whoever created it, so this is a list and not a map: two
 * components may each hold one over the same domain, and neither is the real
 * one. They leave when their scope does.
 */
export const getFormSessions = perRequest('__nuxt_forms_sessions__', () => shallowReactive(new Set<RegisteredSession>()))
