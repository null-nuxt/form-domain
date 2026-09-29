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
 * One per form — a form split across components is one form — and each leaves
 * when the last thing holding it does. A list rather than a map because what is
 * watching wants to read them all, not look one up.
 */
export const getFormSessions = perRequest('__nuxt_forms_sessions__', () => shallowReactive(new Set<RegisteredSession>()))
