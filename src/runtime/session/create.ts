import { computed, effectScope, getCurrentScope, onScopeDispose, ref, shallowReactive, watch, watchEffect } from 'vue'
import { isVisible } from '../engine/visibility'
import { getFormSessions } from './registry'
import { perRequest } from '../request'
import type { ComputedRef } from 'vue'
import type { AnyFields } from '../types'
import type { StepsController, StepsInput } from '../steps/create'
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
  reset(): void
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
  visibleNames: ComputedRef<readonly string[]>
  keysOf(name: never): readonly string[]
  next(gate?: () => boolean | Promise<boolean>): Promise<ValidationResult<unknown>>
}

/** What the form holds, which is not what `.payload()` projects out of it. */
type ValuesOf<Form> = Form extends { values: ComputedRef<infer V> } ? V : never

/** The step that is being left, and what it holds. */
interface StepContext<Form> {
  step: Form extends { steps: { names: ReadonlyArray<infer TName> } } ? TName : string
  /**
   * Only the keys that step declared — the field values, never the payload. A
   * domain that declares `.payload()` projects the WHOLE form for the submit;
   * a step is a part of it, so it hands over what it holds.
   */
  values: Partial<ValuesOf<Form>>
}

/** A wizard's `next` is part of the session only when the form has steps. */
type StepHandling<Form> = Form extends { steps: StepsTarget }
  ? {
      /**
       * Validates the active step, remembers what failed, and advances if it
       * passed. Answers whether it moved.
       *
       * The handler is what has to succeed before leaving — saving the step to
       * a server, most of the time. It runs only after the step validated, gets
       * that step's values, and keeps the wizard where it is by returning
       * `false`, having said why through `setErrors`. Throwing keeps it there
       * too, and the throw is yours: a network that fell over is not a form
       * outcome.
       */
      next: (handler?: (context: StepContext<Form>) => unknown) => Promise<boolean>
    }
  : object

/** Everything about the attempt, which is what the form itself has no business keeping. */
export type FormSession<Form> = {
  /** True between the submit starting and the handler settling. */
  isSubmitting: ComputedRef<boolean>
  /** How many times sending was attempted. Zero is why a pristine form shows nothing. */
  attempts: ComputedRef<number>
  errors: ComputedRef<Partial<Record<KeyOf<Form>, string>>>
  /** The fields visited so far — what decides, with `attempts`, whether a message shows. */
  touched: ComputedRef<ReadonlyArray<KeyOf<Form>>>
  errorOf: (key: KeyOf<Form>) => string | undefined
  /** Marks a field as visited and checks it — for a project that shows errors on blur. */
  touch: (key: KeyOf<Form>) => Promise<void>
  /** What came back from the server, keyed by field. */
  setErrors: (errors: Partial<Record<KeyOf<Form>, string | undefined>>) => void
  clearErrors: () => void
  /**
   * Back to the start: the values the form was declared with, and nothing
   * remembered about the attempt.
   *
   * It resets the form too. "Start over" is one action, and a session that
   * forgot the attempt while the old answers stayed in the fields would be
   * showing a form nobody has touched with everything already filled in.
   */
  reset: () => void
  /**
   * The one thing a `<form>` submits to.
   *
   * Given a function, it validates everything and sends. Given `step` and
   * `done`, it is a wizard's submit: on any step but the last it validates that
   * step, hands `step` what it holds, and moves on; on the last it validates the
   * whole form and hands `done` the payload. The page stops having to know
   * whose turn it is, and `isLast` stops appearing in the template.
   */
  submit: {
    /**
     * Two signatures rather than one taking a union: a union parameter makes
     * TypeScript check a handler against both shapes at once, and a function
     * whose own type is loose stops matching either.
     */
    (handler: (payload: PayloadOf<Form>) => unknown): (event?: Event) => Promise<void>
    // eslint-disable-next-line @typescript-eslint/unified-signatures
    (handlers: SubmitHandlers<Form>): (event?: Event) => Promise<void>
  }
} & StepHandling<Form>

/** The steps a form was built with, recovered from the controller it exposes. */
type StepsOf<Form> = Form extends { steps: StepsController<infer T extends StepsInput> } ? T : never

/**
 * What a wizard's submit does, by step, plus what it does at the end.
 *
 * Keyed by name like everything else here — and the name is what buys the
 * typing: each handler is given exactly the values of the step it is for,
 * present rather than optional, and a name no step has fails to compile.
 */
export type SubmitHandlers<Form> = {
  done: (payload: PayloadOf<Form>) => unknown
} & ([StepsOf<Form>] extends [never]
  ? object
  : {
      [K in keyof StepsOf<Form>]?: (context: {
        step: K
        values: Pick<ValuesOf<Form>, keyof StepsOf<Form>[K] & keyof ValuesOf<Form>>
      }) => unknown
    })

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
function buildSession<Form extends SessionTarget>(form: Form): FormSession<Form> {
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

  /** A field nobody has asked about yet has nothing to say. */
  const askedAbout = (key: string) => attempts.value > 0 || touched.has(key)

  const tickets = new Map<string, number>()

  const answerAgain = async (key: string) => {
    const ticket = (tickets.get(key) ?? 0) + 1
    tickets.set(key, ticket)

    const { errors: messages } = await form.validateField(key)

    // a slower answer about an older value must not win
    if (tickets.get(key) === ticket) keep(key, messages[0])
  }

  /**
   * The others, once per burst rather than once per keystroke. They are asked
   * because a validator can be about more than its own field — a confirmation
   * that has to match, a date that has to come after another — and the field
   * that says so is not the one being typed in. Whoever changed the value is
   * answered straight away; the rest can wait for the typing to pause.
   */
  let pending: ReturnType<typeof setTimeout> | undefined

  const answerTheOthers = (changed: string) => {
    clearTimeout(pending)

    pending = setTimeout(() => {
      for (const key of keys) {
        if (key !== changed && askedAbout(key)) void answerAgain(key)
      }
    }, 120)
  }

  if (getCurrentScope()) onScopeDispose(() => clearTimeout(pending))

  /**
   * Once a field has been asked about, it answers again on every change — which
   * is what lets someone fixing a mistake watch it go away. Before that, a form
   * being filled for the first time stays quiet.
   */
  for (const key of keys) {
    watch(() => fields[key]!.value, () => {
      if (askedAbout(key)) void answerAgain(key)
      answerTheOthers(key)
    })
  }

  const touch = async (key: string) => {
    touched.add(key)
    await answerAgain(key)
  }

  /**
   * Published on the fields for as long as this session lives, so a project
   * wires "visited" the way it wires everything else — through its own extender,
   * under the name its components use. It is what keeps `register()` one door.
   */
  for (const key of keys) fields[key]!.touch = () => void touch(key)

  if (getCurrentScope()) {
    onScopeDispose(() => {
      for (const key of keys) {
        if (fields[key]) fields[key]!.touch = undefined
      }
    })
  }

  const payloadOf = () =>
    ('payload' in form ? (form as { payload: ComputedRef<unknown> }).payload.value : form.values.value)

  /** Validates everything, then hands the payload over. */
  const finish = async (done: (payload: never) => unknown) => {
    const result = await form.validate()
    rememberResult(result)
    if (!result.valid) return

    await done(payloadOf() as never)
  }

  /**
   * Leaves the step the wizard is on: its own keys validated, its handler given
   * the chance to refuse, and the move made if both agree. Answers whether the
   * step was left cleanly, which is not the same as whether it moved — on the
   * last one there is nowhere to move to.
   */
  const leaveCurrentStep = async (handler?: (context: { step: never, values: never }) => unknown) => {
    if (!steps) return true

    const leaving = steps.current.value
    const stepKeys = steps.keysOf(leaving as never)
    let refused = false

    const gate = handler && (async () => {
      const values = Object.fromEntries(stepKeys.map(key => [key, fields[key]?.value]))
      refused = await handler({ step: leaving, values } as never) === false

      return !refused
    })

    const result = await steps.next(gate)

    /**
     * Only on failure: a handler that refused has already said why through
     * `setErrors`, and the step passed its own validation, so remembering that
     * result would wipe exactly the message the server just sent.
     */
    if (!result.valid) rememberResult(result, stepKeys)

    return result.valid && !refused
  }

  /** On the last step there is nothing ahead, so leaving it means finishing. */
  const onTheLastStep = () => {
    if (!steps) return true

    const visible = steps.visibleNames.value
    return visible.indexOf(steps.current.value) === visible.length - 1
  }

  type Keyed = { done: (payload: never) => unknown }
    & Record<string, ((context: { step: never, values: never }) => unknown) | undefined>

  const submit = (handler: ((payload: never) => unknown) | Keyed) => async (event?: Event) => {
    event?.preventDefault()

    // a second click while the first is still in flight is the same click
    if (submitting.value) return

    submitting.value = true
    attempts.value += 1

    try {
      if (typeof handler === 'function') return await finish(handler)
      if (!steps) return await finish(handler.done)

      /**
       * The last step is a step first. It is left the way every other one is,
       * its own handler included — otherwise a wizard that saves each step as
       * it is approved would quietly skip the one the user finishes on — and
       * only then is there nothing ahead, which is what `done` is for.
       */
      const wasLast = onTheLastStep()
      const leftCleanly = await leaveCurrentStep(handler[steps.current.value])

      if (leftCleanly && wasLast) await finish(handler.done)
    }
    finally {
      submitting.value = false
    }
  }

  const steps = (form as { steps?: StepsTarget }).steps

  const next = async (handler?: (context: { step: never, values: never }) => unknown) => {
    // a second click while the first step is still being saved is the same click
    if (!steps || submitting.value) return false

    submitting.value = true
    attempts.value += 1

    const leaving = steps.current.value

    try {
      await leaveCurrentStep(handler)
      return steps.current.value !== leaving
    }
    finally {
      submitting.value = false
    }
  }

  const visited = computed(() => [...touched] as ReadonlyArray<KeyOf<Form>>)

  /**
   * Announced for the length of its scope, so a panel can show what a form is
   * being asked and what it has answered. Nothing reads it to do work.
   */
  const announced = {
    id: (form as { id?: string }).id,
    attempts: computed(() => attempts.value),
    isSubmitting: computed(() => submitting.value),
    errors: errors as ComputedRef<Record<string, string>>,
    touched: visited as ComputedRef<readonly string[]>,
  }

  const sessions = getFormSessions()
  sessions.add(announced)
  if (getCurrentScope()) onScopeDispose(() => sessions.delete(announced))


  return {
    isSubmitting: announced.isSubmitting,
    attempts: announced.attempts,
    errors,
    touched: visited,
    errorOf: (key: string) => messageFor(key),
    touch,
    setErrors: (incoming: Record<string, string | undefined>) => {
      for (const [key, message] of Object.entries(incoming)) keep(key, message, true)
    },
    clearErrors: () => remembered.clear(),
    reset: () => {
      form.reset()
      remembered.clear()
      touched.clear()
      attempts.value = 0
    },
    submit,
    next,
    // assembled loosely; FormSession is the contract it is typed against
  } as unknown as FormSession<Form>
}

interface Held {
  session: unknown
  /** How many scopes are using it. The last one out stops it. */
  holders: number
  stop: () => void
}

/**
 * One session per form, per request.
 *
 * Keyed on the fields rather than on what was handed in: a page that passes
 * `{ ...form, steps }` builds a new object every call, and two components doing
 * that are still looking at one form. The fields ARE the form's identity.
 */
const heldSessions = perRequest('__nuxt_forms_held_sessions__', () => new WeakMap<object, Held>())

export function useFormSession<Form extends SessionTarget>(form: Form): FormSession<Form> {
  const held = heldSessions()
  const existing = held.get(form.fields)

  if (existing) {
    hold(existing)
    return existing.session as FormSession<Form>
  }

  /**
   * A scope of its own, not the caller's. A form split across components is
   * the reason this is shared at all, and the first component to ask for it
   * unmounting must not take the watchers with it.
   */
  const scope = effectScope(true)
  const session = scope.run(() => buildSession(form))!

  const entry: Held = { session, holders: 0, stop: () => scope.stop() }
  held.set(form.fields, entry)
  hold(entry)

  return session
}

/** Counts one more user of a session, and releases it when the last one goes. */
const hold = (entry: Held) => {
  entry.holders += 1

  if (!getCurrentScope()) return

  onScopeDispose(() => {
    entry.holders -= 1
    if (entry.holders === 0) entry.stop()
  })
}
