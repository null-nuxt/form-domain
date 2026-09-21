import { computed, ref, shallowReactive, watch, watchEffect } from 'vue'
import { isVisible } from '../engine/visibility'
import type { ComputedRef } from 'vue'
import type { AnyFields } from '../types'
import type { ValidationResult } from '../standard'

/** What the session remembers about one message. */
interface Remembered {
  message: string
  /**
   * The value the message spoke about. Only a server's message keeps one: it
   * cannot be recomputed, so the only honest way to expire it is the value it
   * was about changing.
   */
  about?: unknown
  fromServer: boolean
}

/**
 * The least a session needs from a form.
 *
 * Written as methods, not as properties holding arrows, because a method's
 * parameters are checked bivariantly: a `validate` that only accepts this
 * form's own keys is not assignable to one accepting any string, and every
 * engine would have been refused by its own session.
 */
interface SessionTarget {
  fields: AnyFields
  values: ComputedRef<unknown>
  validate(keys?: readonly string[]): Promise<ValidationResult<unknown>>
  validateField(key: string): Promise<{ valid: boolean, errors: string[] }>
}

type FieldsOf<Form> = Form extends { fields: infer F } ? F : never
type KeyOf<Form> = keyof FieldsOf<Form> & string

/** What the handler is given: the domain's projection when there is one. */
type PayloadOf<Form> = Form extends { payload: ComputedRef<infer P> }
  ? P
  : Form extends { values: ComputedRef<infer V> } ? V : never

/**
 * What a session needs from a wizard. Structural for the same reason
 * `SessionTarget` is: a controller's own type is too precise to match itself
 * through a generic, so the shape is what gets asked for.
 */
interface StepsTarget {
  current: ComputedRef<string>
  keysOf(name: never): readonly string[]
  next(): Promise<ValidationResult<unknown>>
}

/** A wizard's `next` is part of the session only when the form has steps. */
type StepHandling<Form> = Form extends { steps: StepsTarget }
  ? {
      /**
       * Validates the active step, remembers what failed, and advances if it
       * passed. Answers whether it moved.
       */
      next: () => Promise<boolean>
    }
  : object

/** Everything about the attempt, which is what the form itself has no business keeping. */
export type FormSession<Form> = {
  /** True between the submit starting and the handler settling. */
  isSubmitting: ComputedRef<boolean>
  /** How many times sending was attempted. Zero is why a pristine form shows nothing. */
  attempts: ComputedRef<number>
  errors: ComputedRef<Partial<Record<KeyOf<Form>, string>>>
  errorOf: (key: KeyOf<Form>) => string | undefined
  /** Marks a field as visited and checks it — for a project that shows errors on blur. */
  touch: (key: KeyOf<Form>) => Promise<void>
  /** What came back from the server, keyed by field. */
  setErrors: (errors: Partial<Record<KeyOf<Form>, string | undefined>>) => void
  clearErrors: () => void
  submit: (handler: (payload: PayloadOf<Form>) => unknown) => (event?: Event) => Promise<void>
} & StepHandling<Form>

/**
 * The attempt: what was tried, what came back, and what is worth showing about
 * it — none of which the form can answer, because none of it is derivable from
 * the fields.
 *
 * The split is that simple. `validate()` is the truth and can be asked at any
 * moment; the session is the memory of the last answer, plus the policy for
 * when a message earns the right to be shown. If the two ever disagree, the
 * form is right and the session has not re-run.
 *
 * What it writes, it writes onto the fields — `field.error` — so there is one
 * `register()` and not two. Whether that reaches a component, and under which
 * prop, is the project's call through `extendFormBindings`, the same way
 * `meta.mask` is: an input that declares nothing receives nothing.
 */
export function useFormSession<Form extends SessionTarget>(form: Form): FormSession<Form> {
  const fields = form.fields as AnyFields
  const keys = Object.keys(fields)

  const remembered = shallowReactive(new Map<string, Remembered>())
  const touched = shallowReactive(new Set<string>())
  const attempts = ref(0)
  const submitting = ref(false)

  /**
   * Three reasons a remembered message is not shown: nobody has tried to send
   * yet and the field was never visited; a rule — or a skipped step — is hiding
   * the field, and what isn't validated cannot be wrong; or it came from a
   * server and speaks about a value that has since changed.
   */
  const messageFor = (key: string): string | undefined => {
    const entry = remembered.get(key)
    if (!entry) return undefined
    if (attempts.value === 0 && !touched.has(key)) return undefined

    const field = fields[key]
    if (!field || !isVisible(field)) return undefined
    if (entry.fromServer && entry.about !== field.value) return undefined

    return entry.message
  }

  const keep = (key: string, message: string | undefined, fromServer = false) => {
    if (!message) {
      remembered.delete(key)
      return
    }

    remembered.set(key, { message, fromServer, about: fromServer ? fields[key]?.value : undefined })
  }

  const rememberResult = (result: ValidationResult<unknown>, only?: readonly string[]) => {
    for (const key of only ?? keys) keep(key, result.firstErrors[key])
  }

  const errors = computed(() => {
    const result: Record<string, string> = {}
    for (const key of keys) {
      const message = messageFor(key)
      if (message) result[key] = message
    }

    return result as Partial<Record<KeyOf<Form>, string>>
  })

  /** One reader for everyone: `register()`, an extender, a template. */
  watchEffect(() => {
    for (const key of keys) fields[key]!.error = messageFor(key)
  })

  /**
   * Once a field has been asked about, it answers again on every change — which
   * is what lets someone fixing a mistake watch it go away. Before that, a form
   * being filled for the first time stays quiet.
   */
  for (const key of keys) {
    let latest = 0

    watch(() => fields[key]!.value, async () => {
      if (attempts.value === 0 && !touched.has(key)) return

      const ticket = ++latest
      const { errors: messages } = await form.validateField(key)

      // a slower answer about an older value must not win
      if (ticket === latest) keep(key, messages[0])
    })
  }

  const touch = async (key: string) => {
    touched.add(key)
    const { errors: messages } = await form.validateField(key)
    keep(key, messages[0])
  }

  const payloadOf = () =>
    ('payload' in form ? (form as { payload: ComputedRef<unknown> }).payload.value : form.values.value)

  const submit = (handler: (payload: never) => unknown) => async (event?: Event) => {
    event?.preventDefault()

    // a second click while the first is still in flight is the same click
    if (submitting.value) return

    submitting.value = true
    attempts.value += 1

    try {
      const result = await form.validate()
      rememberResult(result)
      if (!result.valid) return

      await handler(payloadOf() as never)
    }
    finally {
      submitting.value = false
    }
  }

  const steps = (form as { steps?: StepsTarget }).steps

  const next = async () => {
    if (!steps) return false

    const leaving = steps.current.value
    attempts.value += 1

    const result = await steps.next()
    rememberResult(result, steps.keysOf(leaving as never))

    return steps.current.value !== leaving
  }

  return {
    isSubmitting: computed(() => submitting.value),
    attempts: computed(() => attempts.value),
    errors,
    errorOf: (key: string) => messageFor(key),
    touch,
    setErrors: (incoming: Record<string, string | undefined>) => {
      for (const [key, message] of Object.entries(incoming)) keep(key, message, true)
    },
    clearErrors: () => remembered.clear(),
    submit,
    next,
  } as FormSession<Form>
}
