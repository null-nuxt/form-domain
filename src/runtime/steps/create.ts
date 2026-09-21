import { computed, ref } from 'vue'
import { refFields } from '../fields/declare'
import { shapeOf, validateShape } from '../engine/validate'
import { isVisible } from '../engine/visibility'
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

/**
 * Each controller's step conditions, kept outside it so `addStepRules` can
 * write where the navigation reads without the map becoming public API.
 */
const stepConditions = new WeakMap<object, Map<string, () => boolean>>()

/** Internal, for `addStepRules`: the conditions of a controller built here. */
export const conditionsOf = (controller: object): Map<string, () => boolean> | undefined =>
  stepConditions.get(controller)

/** Where the wizard is, and what it takes to leave. */
export interface StepsController<T extends StepsInput> {
  /** One tree, built once, out of every step's declaration. */
  fields: BuiltFields<AllFields<T>>
  /** Every step name, in the order they were declared — skipped ones included. */
  names: ReadonlyArray<keyof T & string>
  /** Whether each step applies, given what has been filled so far. */
  canShow: ComputedRef<Record<keyof T & string, boolean>>
  /** The ones actually walked: what a progress indicator should count. */
  visibleNames: ComputedRef<ReadonlyArray<keyof T & string>>
  current: ComputedRef<keyof T & string>
  index: ComputedRef<number>
  isFirst: ComputedRef<boolean>
  isLast: ComputedRef<boolean>
  /**
   * The active step's keys, minus the ones a rule is hiding — what a template
   * iterates to render exactly what this step is asking for right now.
   */
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
   * Backwards only, and only to a step that applies. Forward goes through
   * `next`, so a step cannot be skipped without having been asked whether it is
   * valid.
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

  /** Filled by `addStepRules`. Empty means every step applies. */
  const conditions = new Map<string, () => boolean>()

  const canShow = computed(() => {
    const result = {} as Record<keyof T & string, boolean>
    for (const name of names) result[name] = conditions.get(name)?.() !== false

    return result
  })

  const visibleNames = computed(() => names.filter(name => canShow.value[name]))

  /**
   * The step asked for, which is not always the step shown: what was filled in
   * one step can take another one away, including the one being looked at.
   */
  const wanted = ref(names[0]!)

  const current = computed(() => {
    const visible = visibleNames.value
    if (visible.includes(wanted.value)) return wanted.value

    // it went away under us: the next one still standing, or the last one before it
    const at = names.indexOf(wanted.value)
    return visible.find(name => names.indexOf(name) > at) ?? visible[visible.length - 1] ?? names[0]!
  })

  const index = computed(() => visibleNames.value.indexOf(current.value))

  const next = async () => {
    const result = await validateShape(
      shapeOf(fields as AnyFields, keys.get(current.value) ?? []),
      fields as AnyFields,
    )

    const ahead = visibleNames.value[index.value + 1]
    if (result.valid && ahead) wanted.value = ahead

    return result as ValidationResult<StepValues<T>>
  }

  const controller: StepsController<T> = {
    fields,
    names,
    canShow,
    visibleNames,
    current,
    index,
    isFirst: computed(() => index.value <= 0),
    isLast: computed(() => index.value === visibleNames.value.length - 1),
    activeKeys: computed(() => (keys.get(current.value) ?? [])
      .filter(key => isVisible((fields as AnyFields)[key]!)) as unknown as ReadonlyArray<keyof AllFields<T> & string>),
    keysOf: name => (keys.get(name) ?? []) as never,
    next,
    back: () => {
      const behind = visibleNames.value[index.value - 1]
      if (behind) wanted.value = behind
    },
    goTo: (name) => {
      const target = visibleNames.value.indexOf(name)
      if (target !== -1 && target < index.value) wanted.value = name
    },
  }

  stepConditions.set(controller, conditions)

  return controller
}
