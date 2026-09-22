import { shallowReactive } from 'vue'
import { perRequest } from '../request'

/**
 * The domains built so far, by id.
 *
 * Per request, because an instance holds reactive state: kept in a module
 * variable, the second request would drive what the first one filled in.
 *
 * Reactive so that a panel watching it sees a form the moment it is built —
 * the instances inside are reactive already; the Map itself was not.
 */
export const getFormRegistry = perRequest('__nuxt_forms__', () => shallowReactive(new Map<string, unknown>()))
