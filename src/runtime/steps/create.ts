import { computed, ref } from 'vue'
import { refFields } from '../fields/declare'
import { shapeOf, validateShape } from '../engine/validate'
import type { ComputedRef } from 'vue'
import type { BuiltFields, CheckedFields, FieldsInput, ValueOfSource } from '../fields/declare'
import type { ValidationResult } from '../standard'
import type { AnyFields, Prettify } from '../types'

/** The wizard's steps: a name, and the slice of the declaration it shows. */
export type StepsInput = Record<string, FieldsInput>

type UnionToIntersection<U> =
  (U extends unknown ? (arg: U) => void : never) extends (arg: infer I) => void ? I : never

/** Every step's fields as one declaration — the single tree they all live in. */
type AllFields<T extends StepsInput> = Prettify<UnionToIntersection<T[keyof T]>>

/** What that tree holds, read off the declaration rather than off what was built. */
type StepValues<T extends StepsInput> = {
  [K in keyof AllFields<T>]: ValueOfSource<AllFields<T>[K]>
}

/** The field keys every OTHER step declares. */
type KeysOfOtherSteps<T extends StepsInput, K extends keyof T> = {
  [Other in Exclude<keyof T, K>]: keyof T[Other]
}[Exclude<keyof T, K>]

/**
 * Each step against all the others.
 *
 * A field key in two steps is one of them being ignored: the tree is built
 * once, so the second declaration never reaches a field. Unlike `mergeFields`,
 * which can say the later fragment is the one overriding, a record has no order
 * the types can read — so both steps are named, and the message carries the key.
 *
 * A step named with a number is refused for a duller reason: JavaScript orders
 * integer-like keys ahead of the rest, so `{ '2': ..., '1': ... }` would walk
 * in an order nobody wrote.
 *
 * The option check rides along, so a wrong option fails at the step that
 * declared it rather than inside the merged tree.
 */
export type CheckedSteps<T extends StepsInput> = {
  [K in keyof T]: K extends number | `${number}`
    ? { __numericStepName: 'a step named with a number would be reordered by the runtime — name it for what it asks' }
    : string extends keyof T[K]
      ? { __fieldKeysNotKnown: 'this step\'s keys are not known here, so the wizard would accept any key — pass a concrete declaration' }
      : [keyof T[K] & KeysOfOtherSteps<T, K>] extends [never]
          ? T[K] & CheckedFields<T[K]>
          : { __duplicateFieldKey: `declared by another step too: ${Extract<keyof T[K] & KeysOfOtherSteps<T, K>, string>}` }
}

/** A wizard with no steps has no current step, so it is refused up front. */
type AtLeastOneStep<T> = [keyof T] extends [never]
  ? { __noSteps: 'a wizard needs at least one step' }
  : T

/** Where the wizard is, and what it takes to leave. */
export interface StepsController<T extends StepsInput> {
  /** One tree, built once, out of every step's declaration. */
  fields: BuiltFields<AllFields<T>>
  /** The step names, in the order they were declared. */
  names: ReadonlyArray<keyof T & string>
  current: ComputedRef<keyof T & string>
  index: ComputedRef<number>
  isFirst: ComputedRef<boolean>
  isLast: ComputedRef<boolean>
  /** The active step's keys — what a template iterates to render only this step. */
  activeKeys: ComputedRef<ReadonlyArray<keyof AllFields<T> & string>>
  keysOf: <TName extends keyof T & string>(name: TName) => ReadonlyArray<keyof T[TName] & string>
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
  goTo: (name: keyof T & string) => void
}

/**
 * Builds a wizard's fields and the machine that walks them.
 *
 * `ref` because this is where the state appears: the fields, and the position
 * within them. What comes in is declarations and stays declarations, so the
 * same ones build another wizard without carrying anything over.
 *
 * The fields are built ONCE, from every step's declaration merged — which is
 * what a step is for: deciding what is shown together, not owning a form of its
 * own. A rule in the last step can read the first step's value, `values` is
 * whole at any point, and the payload stays one projection.
 *
 * Keyed by name rather than listed, the way everything else here is keyed:
 * `refFields({ key })`, `addRules(fields, { key })`. The name belongs to the
 * wizard, not to the fragment — the same declaration is `address` in one form
 * and `location` in the next.
 */
export const refSteps = <T extends StepsInput>(
  steps: AtLeastOneStep<T> & CheckedSteps<T>,
): StepsController<T> => {
  const declared = steps as unknown as StepsInput

  // the types were checked on the way in; the merged object cannot carry them
  const fields = refFields(
    Object.assign({}, ...Object.values(declared)) as FieldsInput,
  ) as StepsController<T>['fields']

  const names = Object.keys(declared) as ReadonlyArray<keyof T & string>
  const keys = new Map(Object.entries(declared).map(([name, slice]) => [name, Object.keys(slice)]))

  const position = ref(0)
  const current = computed(() => names[position.value]!)

  const next = async () => {
    const result = await validateShape(
      shapeOf(fields as AnyFields, keys.get(current.value) ?? []),
      fields as AnyFields,
    )

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
