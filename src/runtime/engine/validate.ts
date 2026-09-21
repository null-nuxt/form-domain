import { isStandardSchema, runStandard } from '../standard'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ValidationResult } from '../standard'
import type { AnyFields, ValuesOf } from '../types'

/**
 * The validators of the fields asked for, minus the ones a rule is hiding.
 *
 * A hidden field isn't validated — that's what erases most `.when()` calls,
 * since the condition was already stated once in `canShow`. And a validator
 * declared as a getter is called here, once, where the answer is about to be
 * used: that is what lets it depend on state without going stale.
 */
export const shapeOf = (fields: AnyFields, keys: readonly string[]): Record<string, StandardSchemaV1> => {
  const result: Record<string, StandardSchemaV1> = {}

  for (const key of keys) {
    const field = fields[key]
    const declared = field?.schema
    if (!field || !declared) continue
    if (field.rule?.canShow && field.rule.canShow() === false) continue

    result[key] = isStandardSchema(declared) ? declared : (declared as () => StandardSchemaV1)()
  }

  return result
}

/**
 * Runs a shape against the values the fields hold right now.
 *
 * Kept apart from the engine because it is the one thing every entry point
 * needs: the whole form on submit, one field on blur, a step's keys before the
 * wizard advances. One implementation means they cannot disagree about what is
 * required — which is the same reason a hidden field is dropped here and not
 * at each caller.
 */
export const validateShape = async <F extends AnyFields>(
  shape: Record<string, StandardSchemaV1>,
  fields: F,
): Promise<ValidationResult<ValuesOf<F>>> => {
  const errors: Record<string, string[]> = {}
  const firstErrors: Record<string, string> = {}
  const validated: Record<string, unknown> = {}

  await Promise.all(
    Object.entries(shape).map(async ([key, validator]) => {
      const result = await runStandard(validator, fields[key]!.value)

      if (result.ok) {
        validated[key] = result.value
        return
      }

      const messages = result.issues.map(issue => issue.message)
      errors[key] = messages
      if (messages[0]) firstErrors[key] = messages[0]
    }),
  )

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    firstErrors,
    values: validated as Partial<ValuesOf<F>>,
  }
}

/** The two together: what a subset of the form says about itself. */
export const validateFields = <F extends AnyFields>(
  fields: F,
  keys: readonly string[],
): Promise<ValidationResult<ValuesOf<F>>> => validateShape(shapeOf(fields, keys), fields)
