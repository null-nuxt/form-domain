import { computed, effectScope, getCurrentScope, onScopeDispose } from 'vue'
import { getFormRegistry } from './registry'
import { createEngine } from '../engine/create'
import type { ComputedRef } from 'vue'
import type { StepsController, StepsInput } from '../steps/create'
import type { AnyFields, Exposed, FieldsOf, FormEngine, OnlyKnownKeys, SelectedOptions, SetupResult, ValuesOf } from '../types'

/**
 * A form assembled inside a component. The component's own `setup` is already
 * the scope, so there is no wrapper to write: declare the fields, attach the
 * rules, hand them over.
 *
 * `to` in the sense Vue uses it — `toRefs`, `toValue` — deriving one shape from
 * another. Not `create`, which in this package used to mean a builder you had
 * to terminate; and not `useForm`, which vee-validate already exports.
 */
/** What a form assembled in a component can project from, with no setup to expose. */
export interface ComponentPayloadContext<F extends AnyFields> {
  fields: F
  values: ValuesOf<F>
  /** Only what a rule is currently letting through. */
  visible: Partial<ValuesOf<F>>
  selected: SelectedOptions<F>
}

export function toForm<F extends AnyFields>(fields: F): FormEngine<F>
export function toForm<F extends AnyFields, P>(
  fields: F,
  options: { payload: (ctx: ComponentPayloadContext<F>) => P },
): FormEngine<F> & { payload: ComputedRef<P> }
export function toForm<F extends AnyFields>(
  fields: F,
  options?: { payload: (ctx: ComponentPayloadContext<F>) => unknown },
) {
  const scope = effectScope(true)
  const engine = scope.run(() => createEngine(fields))!

  const dispose = () => {
    engine.dispose()
    scope.stop()
  }

  if (getCurrentScope()) onScopeDispose(dispose)

  if (!options?.payload) return { ...engine, dispose }

  /**
   * The same projection a domain declares, for a form that has no domain to
   * declare it on. Without it every component form maps its values by hand at
   * the submit, which is the one piece of a form that has to agree with the
   * backend exactly.
   */
  const context: ComponentPayloadContext<F> = {
    fields,
    get values() {
      return engine.values.value
    },
    get visible() {
      return engine.visible.value
    },
    get selected() {
      return engine.selected.value
    },
  }

  return { ...engine, dispose, payload: computed(() => options.payload(context)) }
}

type PayloadContext<S extends SetupResult> = Exposed<S> & {
  fields: FieldsOf<S>
  /** Only what a rule is currently letting through. */
  visible: Partial<ValuesOf<FieldsOf<S>>>
  /** The chosen option per field — where a label goes into the payload from. */
  selected: SelectedOptions<FieldsOf<S>>
}

/** The steps a setup built, when it built any. */
type StepsOfSetup<S> = S extends { steps: StepsController<infer T extends StepsInput> } ? T : never

/**
 * What a step's projection reads: the same context the form's does, with the
 * values narrowed to the keys that step declared.
 */
type StepPayloadContext<S extends SetupResult, K extends keyof StepsOfSetup<S>> = PayloadContext<S> & {
  values: Pick<ValuesOf<FieldsOf<S>>, keyof StepsOfSetup<S>[K] & keyof ValuesOf<FieldsOf<S>>>
}

/**
 * The projections, by step, plus `done` for the whole form.
 *
 * Same reserved key as the submit, and for the same reason: the object needs
 * one key that means the end rather than a step.
 */
export type PayloadMap<S extends SetupResult> = {
  done: (ctx: PayloadContext<S>) => unknown
} & { [K in keyof StepsOfSetup<S>]?: (ctx: StepPayloadContext<S, K>) => unknown }

/**
 * The names a projection map may use: the steps, plus `done`. A form without
 * steps has only `done` — which is the function form, written the long way.
 */
type ProjectionKeys<S extends SetupResult> = [StepsOfSetup<S>] extends [never]
  ? 'done'
  : (keyof StepsOfSetup<S> & string) | 'done'

/** What one step sends, once the projections are known. */
type StepBody<S extends SetupResult, SP, K extends keyof StepsOfSetup<S>> = K extends keyof SP
  ? SP[K]
  : Pick<ValuesOf<FieldsOf<S>>, keyof StepsOfSetup<S>[K] & keyof ValuesOf<FieldsOf<S>>>

/** Every step's body, by name — an empty record for a form without steps. */
export type StepBodies<S extends SetupResult, SP> = {
  [K in keyof StepsOfSetup<S>]: ComputedRef<StepBody<S, SP, K>>
}

type StepReturns<M> = {
  [K in Exclude<keyof M, 'done'>]: M[K] extends (...args: never[]) => infer R ? R : never
}

export type FormDomainInstance<S extends SetupResult, P, SP = object, Id extends string = string> =
  FormEngine<FieldsOf<S>> & Exposed<S> & {
    /** The literal is preserved: it's what lets `useFormDomain('slug')` type its return. */
    id: Id
    payload: ComputedRef<P>
    /**
     * What each step sends, by name: its own projection where it declared one,
     * and otherwise the values it holds — the same default the form's payload
     * has, one step down.
     *
     * A record of computeds rather than a `stepPayload(name)` function because
     * the step has to be known at the type level: inference through a generic
     * signature instantiates its parameter with the constraint, and every step
     * would be handed the union of all of them.
     */
    stepPayloads: StepBodies<S, SP>
  }

export interface FormDomain<Meta, S extends SetupResult, P, SP = object, Id extends string = string> {
  (): FormDomainInstance<S, P, SP, Id>
  id: Id
  /**
   * Static, and hung off the factory rather than the instance: a listing reads
   * every domain's metadata without building a single form.
   */
  metadata: Meta
  /**
   * How the filled form is projected for the backend.
   *
   * Outside the setup on purpose: it becomes a pure function of what the setup
   * exposed, so it is testable without instantiating, cannot reach anything
   * the setup kept private, and gives the setup's return a job — it is the
   * public surface.
   *
   * One step, so there is no order to get wrong.
   *
   * A wizard can project per step instead, keyed by name with `done` for the
   * whole form — so what leaves for the backend when a step is approved is
   * declared here too, rather than mapped again in whichever page is showing
   * the wizard.
   */
  payload: {
    <P2>(project: (ctx: PayloadContext<S>) => P2): FormDomain<Meta, S, P2, object, Id>
    /**
     * `OnlyKnownKeys` for the same reason every other keyed call here has it:
     * the constraint alone is checked loosely — a key no step has would be
     * accepted and then never called, which is the silence this whole module
     * is against.
     */
    <M extends PayloadMap<S>>(
      projections: M & OnlyKnownKeys<M, ProjectionKeys<S>>,
    ): FormDomain<Meta, S, ReturnType<M['done']>, StepReturns<M>, Id>
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Projection = (ctx: any) => unknown

/** The shape a wizard's controller is read through here, and nothing more. */
interface StepsShape {
  names: ReadonlyArray<string>
  keysOf: (name: never) => readonly string[]
}

/**
 * One computed per step: its projection applied to the step's own values, or
 * those values as they are. A form without steps gets an empty record, which
 * is what every form had before any of this existed.
 */
function bodiesOf(
  result: SetupResult,
  fields: AnyFields,
  context: object,
  perStep: Record<string, Projection>,
): Record<string, ComputedRef<unknown>> {
  const steps = (result as { steps?: StepsShape }).steps
  if (!steps) return {}

  const bodies: Record<string, ComputedRef<unknown>> = {}

  for (const name of steps.names) {
    const keys = steps.keysOf(name as never)
    bodies[name] = computed(() => {
      const values = Object.fromEntries(keys.map(key => [key, fields[key]?.value]))
      const projection = perStep[name]

      return projection ? projection({ ...context, values }) : values
    })
  }

  return bodies
}

function create<Meta, S extends SetupResult, Id extends string>(
  id: Id,
  metadata: Meta,
  setup: () => S,
  project?: Projection | Record<string, Projection>,
): FormDomain<Meta, S, unknown, object, Id> {
  const use = () => {
    const registry = getFormRegistry()

    if (!registry.has(id)) {
      /**
       * A detached scope: the effects belong to the domain, not to whichever
       * component asked for it first — a form split across sub-components
       * would lose them when the first child unmounted.
       */
      const scope = effectScope(true)

      const instance = scope.run(() => {
        const result = setup()

        // `steps.fields` is the tree; a wizard's setup should not have to say it twice
        const fields = 'fields' in result ? result.fields : result.steps.fields
        const engine = createEngine(fields)
        const { fields: _fields, ...exposed } = result as { fields?: AnyFields }

        /** A map keyed by step, or one function for the whole form. */
        const whole = typeof project === 'function' ? project : project?.done
        const perStep = typeof project === 'function' ? {} : (project ?? {})

        const payloadContext = {
          ...exposed,
          fields,
          get visible() {
            return engine.visible.value
          },
          get selected() {
            return engine.selected.value
          },
        }

        return {
          ...engine,
          ...exposed,
          id,
          payload: computed(() =>
            whole ? whole(payloadContext) : engine.values.value,
          ),
          stepPayloads: bodiesOf(result, fields, payloadContext, perStep),
          dispose: (): void => {
            engine.dispose()
            scope.stop()
          },
        }
      })

      registry.set(id, instance)
    }

    return registry.get(id) as FormDomainInstance<S, unknown, object, Id>
  }

  const domain = Object.assign(use, {
    id,
    metadata,
    payload: (next: Projection | Record<string, Projection>) =>
      create(id, metadata, setup, next),
  }) as unknown as FormDomain<Meta, S, unknown, object, Id>

  return domain
}

/**
 * Declares a form domain: a setup that builds the fields and whatever it wants
 * to expose, plus a static catalog entry that stays readable without running
 * any of it.
 *
 * The setup returns its fields under the reserved `fields` key; everything
 * else it returns is exposed untouched. Nothing is classified — the engine only
 * needs to know which of them are the fields.
 */
export function defineFormDomain<const Id extends string, S extends SetupResult>(
  id: Id,
  setup: () => S,
): FormDomain<object, S, ValuesOf<FieldsOf<S>>, object, Id>
export function defineFormDomain<const Id extends string, Meta extends object, S extends SetupResult>(
  id: Id,
  metadata: Meta,
  setup: () => S,
): FormDomain<Meta, S, ValuesOf<FieldsOf<S>>, object, Id>
export function defineFormDomain(
  id: string,
  second: object | (() => SetupResult),
  third?: () => SetupResult,
) {
  const setup = (third ?? second) as () => SetupResult
  const metadata = third ? second : {}

  return create(id, metadata, setup)
}
