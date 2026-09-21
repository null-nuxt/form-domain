import { computed, effectScope, getCurrentScope, onScopeDispose } from 'vue'
import { getFormRegistry } from './registry'
import { createEngine } from './engine'
import type { ComputedRef } from 'vue'
import type { AnyFields, Exposed, FormEngine, SelectedOptions, SetupResult, ValuesOf } from './types'

/**
 * A form assembled inside a component. The component's own `setup` is already
 * the scope, so there is no wrapper to write: declare the fields, attach the
 * rules, hand them over.
 *
 * `to` in the sense Vue uses it — `toRefs`, `toValue` — deriving one shape from
 * another. Not `create`, which in this package used to mean a builder you had
 * to terminate; and not `useForm`, which vee-validate already exports.
 */
export function toForm<F extends AnyFields>(fields: F): FormEngine<F> {
  const scope = effectScope(true)
  const engine = scope.run(() => createEngine(fields))!

  const dispose = () => {
    engine.dispose()
    scope.stop()
  }

  if (getCurrentScope()) onScopeDispose(dispose)

  return { ...engine, dispose }
}

type PayloadContext<S extends SetupResult> = Exposed<S> & {
  fields: S['fields']
  /** Only what a rule is currently letting through. */
  visible: Partial<ValuesOf<S['fields']>>
  /** The chosen option per field — where a label goes into the payload from. */
  selected: SelectedOptions<S['fields']>
}

export type FormDomainInstance<S extends SetupResult, P, Id extends string = string> =
  FormEngine<S['fields']> & Exposed<S> & {
    /** The literal is preserved: it's what lets `useFormDomain('slug')` type its return. */
    id: Id
    payload: ComputedRef<P>
  }

export interface FormDomain<Meta, S extends SetupResult, P, Id extends string = string> {
  (): FormDomainInstance<S, P, Id>
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
   */
  payload: <P2>(project: (ctx: PayloadContext<S>) => P2) => FormDomain<Meta, S, P2, Id>
}

function create<Meta, S extends SetupResult, Id extends string>(
  id: Id,
  metadata: Meta,
  setup: () => S,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  project?: (ctx: any) => unknown,
): FormDomain<Meta, S, unknown, Id> {
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
        const engine = createEngine(result.fields)
        const { fields: _fields, ...exposed } = result

        const payloadContext = {
          ...exposed,
          fields: result.fields,
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
            project ? project(payloadContext) : engine.values.value,
          ),
          dispose: (): void => {
            engine.dispose()
            scope.stop()
          },
        }
      })

      registry.set(id, instance)
    }

    return registry.get(id) as FormDomainInstance<S, unknown, Id>
  }

  const domain = Object.assign(use, {
    id,
    metadata,
    payload: <P2>(next: (ctx: PayloadContext<S>) => P2) =>
      create(id, metadata, setup, next) as unknown as FormDomain<Meta, S, P2, Id>,
  }) as FormDomain<Meta, S, unknown, Id>

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
): FormDomain<object, S, ValuesOf<S['fields']>, Id>
export function defineFormDomain<const Id extends string, Meta extends object, S extends SetupResult>(
  id: Id,
  metadata: Meta,
  setup: () => S,
): FormDomain<Meta, S, ValuesOf<S['fields']>, Id>
export function defineFormDomain(
  id: string,
  second: object | (() => SetupResult),
  third?: () => SetupResult,
) {
  const setup = (third ?? second) as () => SetupResult
  const metadata = third ? second : {}

  return create(id, metadata, setup)
}
