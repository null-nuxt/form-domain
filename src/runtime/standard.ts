import type { StandardSchemaV1 } from '@standard-schema/spec'

export interface FieldIssue {
  message: string
  path?: ReadonlyArray<PropertyKey>
}

export interface ValidationResult<TValues> {
  valid: boolean
  /** Errors per field, in the order the validator returned them. */
  errors: Record<string, string[]>
  /** The first message per field — what most UIs display. */
  firstErrors: Record<string, string>
  /** Only the validated fields: hidden ones are not included. */
  values: Partial<TValues>
}

/** One field's outcome — what validating on blur needs, without the whole form. */
export interface FieldValidationResult {
  valid: boolean
  /** In the order the validator returned them; empty when valid. */
  errors: string[]
}

/**
 * Whether a value is a validator, as opposed to a getter returning one.
 *
 * Asked by the spec's own marker rather than by `typeof === 'function'`: ArkType's
 * types are functions that ARE schemas. Taking them for getters called the
 * validator with no argument and used what came back as a schema, so every
 * validation threw.
 */
export const isStandardSchema = (value: unknown): value is StandardSchemaV1 =>
  (typeof value === 'object' || typeof value === 'function')
  && value !== null
  && '~standard' in value

/**
 * Runs a Standard Schema validator. Works with any library implementing the
 * spec — yup 1.7+, Zod, Valibot, ArkType — because the only thing we touch is
 * `~standard.validate`.
 */
export const runStandard = async (
  schema: StandardSchemaV1,
  value: unknown,
): Promise<{ ok: true, value: unknown } | { ok: false, issues: readonly FieldIssue[] }> => {
  const result = await schema['~standard'].validate(value)

  if (result.issues) {
    return { ok: false, issues: result.issues as readonly FieldIssue[] }
  }

  return { ok: true, value: result.value }
}
