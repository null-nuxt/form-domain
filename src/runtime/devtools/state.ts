import { getFormRegistry } from '../domain/registry'
import { getFormSessions } from '../session/registry'
import { isVisible } from '../engine/visibility'
import type { AnyFields } from '../types'

/** One field, as the inspector shows it. */
export interface InspectedField {
  key: string
  label: string
  value: unknown
  /** False when a rule — or a step being skipped — is hiding it. */
  shown: boolean
  /** Whether it is in `shape` right now, which is what `validate()` will ask about. */
  validated: boolean
  /** Which of the rule's parts were attached: `canShow`, `deriveOptions`… */
  rule: string[]
  options?: number
  selected?: unknown
  meta?: Record<string, unknown>
  /** What a session is showing for it, if anything. */
  error?: string
  touched: boolean
}

export interface InspectedSteps {
  names: string[]
  visible: string[]
  current: string
  activeKeys: string[]
}

export interface InspectedSession {
  attempts: number
  isSubmitting: boolean
  touched: string[]
  errors: Record<string, string>
}

export interface InspectedForm {
  id: string
  fields: InspectedField[]
  values: Record<string, unknown>
  payload?: unknown
  /** The keys `validate()` would ask about right now. */
  shape: string[]
  steps?: InspectedSteps
  session?: InspectedSession
}

/** Reads a getter that may not be there, without letting it take the page down. */
const attempt = <T>(read: () => T): T | undefined => {
  try {
    return read()
  }
  catch {
    return undefined
  }
}

const ruleParts = (rule: Record<string, unknown> | undefined): string[] =>
  rule ? Object.keys(rule).filter(part => rule[part] !== undefined) : []

/** How many options the field is offering right now — a rule's list wins over the declared one. */
const optionCount = (field: {
  declaredOptions?: readonly unknown[]
  rule?: { deriveOptions?: () => readonly unknown[] }
}): number | undefined => {
  if (field.declaredOptions === undefined) return undefined

  const list = attempt(() => field.rule?.deriveOptions ? field.rule.deriveOptions() : field.declaredOptions)
  return list?.length
}

/**
 * What every built form is doing right now.
 *
 * Reading only: it walks the same per-request registry the catalog uses, and
 * touches nothing. Called inside a `computed`, it re-reads when any of it
 * changes, because what it reads are the reactive fields themselves.
 */
export const inspectForms = (): InspectedForm[] => {
  const sessions = [...getFormSessions()]

  return [...getFormRegistry().entries()].map(([id, instance]) => {
    const form = instance as {
      fields: AnyFields
      values: { value: Record<string, unknown> }
      shape: { value: Record<string, unknown> }
      payload?: { value: unknown }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      steps?: any
    }

    const session = sessions.find(entry => entry.id === id)
    const shape = Object.keys(attempt(() => form.shape.value) ?? {})
    const touched = session ? [...session.touched.value] : []

    const fields = Object.entries(form.fields ?? {}).map(([key, field]) => ({
      key,
      label: field.label,
      value: field.value,
      shown: isVisible(field),
      validated: shape.includes(key),
      rule: ruleParts(field.rule as Record<string, unknown> | undefined),
      options: optionCount(field),
      selected: attempt(() => field.selected),
      meta: field.meta,
      error: field.error,
      touched: touched.includes(key),
    })) as InspectedField[]

    const steps = form.steps && {
      names: [...form.steps.names],
      visible: [...form.steps.visibleNames.value],
      current: form.steps.current.value,
      activeKeys: [...form.steps.activeKeys.value],
    }

    return {
      id,
      fields,
      values: attempt(() => form.values.value) ?? {},
      payload: attempt(() => form.payload?.value),
      shape,
      steps,
      session: session && {
        attempts: session.attempts.value,
        isSubmitting: session.isSubmitting.value,
        touched,
        errors: { ...session.errors.value },
      },
    }
  })
}
