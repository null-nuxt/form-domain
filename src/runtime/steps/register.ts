import { conditionsOf } from './create'
import type { StepsController, StepsInput } from './create'
import type { AnyFields, OnlyKnownKeys } from '../types'

/**
 * Behaviour for one step. `canShow` only, for now: it is the question a step
 * raises that a field's rule cannot answer, because it is about a part of the
 * form rather than about a value.
 */
export interface StepRule {
  /**
   * Whether this step applies at all, given what has been filled.
   *
   * A step that doesn't apply is walked past — and its fields go with it: they
   * stop being shown, stop being validated, and stop being required on submit.
   * Skipping a step while still asking for its fields is a form that cannot be
   * sent and cannot say why.
   */
  canShow?: () => boolean
}

/**
 * Behaviour for the wizard's steps, keyed by name — the same shape `addRules`
 * takes for fields, for the same reason: declaring comes first, and what
 * depends on state is attached afterwards, where the state exists.
 *
 * There is no singular form. A step is not an object you hold, it is a name
 * within a wizard, so the wizard is the target.
 */
export function addStepRules<T extends StepsInput, R>(
  steps: StepsController<T>,
  rules: R
    & { [K in keyof T]?: StepRule }
    & OnlyKnownKeys<R, keyof T & string>,
): void {
  const conditions = conditionsOf(steps)

  if (!conditions) {
    console.warn('[@null-nuxt/form-domain] addStepRules was given something refSteps did not build.')
    return
  }

  for (const [name, rule] of Object.entries(rules as Record<string, StepRule | undefined>)) {
    const canShow = rule?.canShow
    if (!canShow) continue

    if (conditions.has(name) && import.meta.dev) {
      console.warn(
        `[@null-nuxt/form-domain] step "${name}" already had a rule; the later one replaces it. `
        + `Declaring the same step in two places is usually a copy-paste.`,
      )
    }

    conditions.set(name, canShow)

    /**
     * Written onto the fields as well, because "hidden" has one meaning here:
     * the engine asks the field, and the field now knows its step can be off.
     */
    for (const key of steps.keysOf(name as keyof T & string)) {
      const field = (steps.fields as AnyFields)[key]
      if (field) field.groupCanShow = canShow
    }
  }
}
