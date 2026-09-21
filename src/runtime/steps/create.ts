import { computed, ref } from 'vue'
import { refFields } from '../fields/declare'
import { shapeOf, validateShape } from '../engine/validate'
import type { ComputedRef } from 'vue'
import type { StepInput } from './declare'
import type { BuiltFields, CheckedFields, CheckedFragment, FieldsInput, MergedFields, ValueOfSource } from '../fields/declare'
import type { ValidationResult } from '../standard'
import type { AnyFields } from '../types'

/** The steps' declarations, in order, as the tuple `mergeFields` would take. */
type DeclarationsOf<T extends readonly StepInput[]> = { [I in keyof T]: T[I]['fields'] }

/** Every step's fields as one declaration — the single tree they all live in. */
type AllFields<T extends readonly StepInput[]> =
  DeclarationsOf<T> extends readonly FieldsInput[] ? MergedFields<DeclarationsOf<T>> : never

/** What that tree holds, read off the declaration rather than off what was built. */
type StepValues<T extends readonly StepInput[]> = {
  [K in keyof AllFields<T>]: ValueOfSource<AllFields<T>[K]>
}

type StepName<T extends readonly StepInput[]> = T[number]['name']

type StepNamed<T extends readonly StepInput[], TName> = Extract<T[number], { name: TName }>

/**
 * Each step against the ones before it: a field key declared twice, and a step
 * name used twice, are both the later one quietly replacing the earlier.
 *
 * The field check is `mergeFields`'s, because that is what this does with the
 * declarations — the steps only decide which keys are shown together. The
 * option check rides along, so a wrong option fails at the step that declared
 * it rather than inside the merged tree.
 */
export type CheckedSteps<T extends readonly StepInput[], SeenKeys = never, SeenNames = never> =
  T extends readonly [infer First extends StepInput, ...infer Rest extends readonly StepInput[]]
    ? [
        {
          name: [First['name'] & SeenNames] extends [never]
            ? First['name']
            : { __duplicateStepName: `already the name of an earlier step: ${First['name']}` }
          fields: CheckedFragment<First['fields'], SeenKeys> & CheckedFields<First['fields']>
        },
        ...CheckedSteps<
          Rest,
          SeenKeys | (string extends keyof First['fields'] ? never : keyof First['fields']),
          SeenNames | First['name']
        >,
      ]
    : []

/** Where the wizard is, and what it takes to leave. */
export interface StepsController<T extends readonly StepInput[]> {
  /** One tree, built once, out of every step's declaration. */
  fields: BuiltFields<AllFields<T>>
  /** The step names, in the order they were declared. */
  names: ReadonlyArray<StepName<T>>
  current: ComputedRef<StepName<T>>
  index: ComputedRef<number>
  isFirst: ComputedRef<boolean>
  isLast: ComputedRef<boolean>
  /** The active step's keys — what a template iterates to render only this step. */
  activeKeys: ComputedRef<ReadonlyArray<keyof AllFields<T> & string>>
  keysOf: <TName extends StepName<T>>(
    name: TName,
  ) => ReadonlyArray<keyof StepNamed<T, TName>['fields'] & string>
  /**
   * Validates the active step and moves on only if it passes. The result comes
   * back either way: what to show for a field that failed is the session's
   * question, not the machine's.
   */
  next: () => Promise<ValidationResult<StepValues<T>>>
  back: () => void
  /**
   * Backwards only. Forward goes through `next`, so a step cannot be skipped
   * without having been asked whether it is valid.
   */
  goTo: (name: StepName<T>) => void
}

/**
 * Builds a wizard's fields and the machine that walks them.
 *
 * `ref` because this is where the state appears: the fields, and the position
 * within them. The steps handed in are declarations and stay that way, so the
 * same ones build another wizard without carrying anything over.
 *
 * The fields are built ONCE, from every step's declaration merged — which is
 * what a step is for: deciding what is shown together, not owning a form of its
 * own. A rule in the last step can read the first step's value, `values` is
 * whole at any point, and the payload stays one projection.
 */
export const refSteps = <T extends readonly [StepInput, ...StepInput[]]>(
  steps: [...T] & CheckedSteps<T>,
): StepsController<T> => {
  const declared = steps as unknown as readonly StepInput[]

  // the types were checked on the way in; the merged object cannot carry them
  const fields = refFields(
    Object.assign({}, ...declared.map(step => step.fields)) as FieldsInput,
  ) as StepsController<T>['fields']

  const names = declared.map(step => step.name) as ReadonlyArray<StepName<T>>
  const keys = new Map(declared.map(step => [step.name, Object.keys(step.fields)]))

  const position = ref(0)
  const current = computed(() => names[position.value]!)

  const next = async () => {
    const result = await validateShape(shapeOf(fields as AnyFields, keys.get(current.value) ?? []), fields as AnyFields)
    if (result.valid && position.value < names.length - 1) position.value += 1

    return result as ValidationResult<StepValues<T>>
  }

  return {
    fields,
    names,
    current,
    index: computed(() => position.value),
    isFirst: computed(() => position.value === 0),
    isLast: computed(() => position.value === names.length - 1),
    activeKeys: computed(() => (keys.get(current.value) ?? []) as unknown as ReadonlyArray<keyof AllFields<T> & string>),
    keysOf: name => (keys.get(name) ?? []) as never,
    next,
    back: () => {
      if (position.value > 0) position.value -= 1
    },
    goTo: (name) => {
      const target = names.indexOf(name)
      if (target !== -1 && target < position.value) position.value = target
    },
  }
}
