import type { ComputedRef } from 'vue'
import type { FieldValidationResult, ValidationResult } from './standard'
import type { BuiltFields, FieldObj, FieldsInput } from './fields/declare'
import type { ContractKey } from './engine/bindings'

export interface FieldOption<TValue> {
  label: string
  value: TValue
}

/**
 * What one option holds, given the field's value.
 *
 * A multi-choice field stores an array, and each option is ONE of its entries —
 * typing the option with the whole array made checkbox groups and multi-selects
 * impossible to declare. And `null` is how a field says "nothing chosen yet",
 * never a choice itself, so it doesn't leak into the options: a select bound to
 * `string | null` lists `string`s.
 *
 * `null` comes off BEFORE asking whether it's an array. The other way round,
 * `string[] | null` is not an array, so its options were typed with the whole
 * array and the declaration was rejected.
 */
export type OptionValue<TValue> = [NonNullable<TValue>] extends [ReadonlyArray<infer E>] ? E : NonNullable<TValue>

/**
 * One option for a single choice; the chosen ones, in list order, for a multi-choice field.
 *
 * `any` gets both shapes: `[any] extends [ReadonlyArray]` is true, and without this the
 * wide `FieldObj<any>` behind `AnyFields` would demand an array from every single choice.
 */
export type SelectedOf<TValue> = 0 extends 1 & TValue
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ? FieldOption<any> | FieldOption<any>[] | undefined
  : [TValue] extends [ReadonlyArray<unknown>]
    ? FieldOption<OptionValue<TValue>>[]
    // a nullable multi-choice holds nothing while null, and every chosen one once set
    : [NonNullable<TValue>] extends [ReadonlyArray<unknown>]
      ? FieldOption<OptionValue<TValue>>[] | undefined
      : FieldOption<OptionValue<TValue>> | undefined

/**
 * A literal type widened to the primitive it belongs to — `'PF' | 'PJ'` to
 * `string` — arrays included, everything else untouched. What a component that
 * isn't generic over the field's value actually emits.
 */
export type WidenLiteral<T> =
  T extends string ? string
    : T extends number ? number
      : T extends boolean ? boolean
        : T extends ReadonlyArray<infer E> ? WidenLiteral<E>[]
          : T

/** Any built fields object, for constraints that don't care about the shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFields = Record<string, FieldObj<any, any>>

export type ValuesOf<F extends AnyFields> = { [K in keyof F]: F[K]['value'] }

/**
 * Whether the field declared `options` at all — an empty list counts, and is how
 * a field says "I am a select, the list comes later".
 *
 * Declaring it is what lets a rule derive the list, and what puts the field into
 * `options` and `selected`. Without that marker those two would have to list
 * every field, typing a plain text input as though it could hold a choice.
 */
export type HasOptions<F extends AnyFields, K extends keyof F> =
  'options' extends keyof NonNullable<F[K]['__declared']> ? true : false

/** Only the fields that declared options. */
export type OptionFields<F extends AnyFields> = {
  [K in keyof F as HasOptions<F, K> extends true ? K : never]: F[K]
}

/**
 * The option matching each field's current value, resolved from the effective
 * list. The field still stores only the value — storing the whole object would
 * break `v-model` by identity, break `oneOf`, and send an object where the API
 * expects a scalar.
 *
 * Keyed by the fields that can actually hold a choice, so a text input is not
 * typed as though it might.
 */
export type SelectedOptions<F extends AnyFields> = {
  [K in keyof OptionFields<F>]: SelectedOf<F[K]['value']>
}

/**
 * A key outside `Allowed` becomes `never`, which nothing satisfies — that's
 * what makes `addRules(fields, { missing: ... })` fail to compile.
 *
 * The `string extends Allowed` branch guards the failure mode: when the keys
 * aren't known, every key passes and the check silently accepts anything.
 * Silently is the problem, so it becomes an error naming the cause.
 */
export type OnlyKnownKeys<T, Allowed extends string> = string extends Allowed
  ? { __fieldsNotKnownHere: 'the field keys are not known here, so this check would silently accept anything — pass a concrete fields object' }
  : { [K in keyof T]: K extends Allowed ? T[K] : never }

/**
 * The extras an input may receive. All optional: the engine only emits the ones
 * that have a value at runtime, because `v-bind` of a key the component doesn't
 * declare lands as a stray DOM attribute.
 */
interface FieldExtras {
  placeholder?: string
}

/**
 * Keys a project adds to `register()`, typed per field. Empty here; augment it
 * alongside an `extendFormBindings` extender:
 *
 * ```ts
 * declare module '#forms' {
 *   interface CustomFieldBindings<F extends AnyFields, K extends keyof F> {
 *     mask?: MaskOptions
 *   }
 * }
 * ```
 *
 * Generic over the form and the key, the way `PiniaCustomProperties` is, so an
 * added key can depend on the field — `MetaOf<F, K>` reads what it declared.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-object-type
export interface CustomFieldBindings<F extends AnyFields, K extends keyof F> {}

/** What a field declared in `meta`, or `undefined` if it declared none. */
export type MetaOf<F extends AnyFields, K extends keyof F> = F[K]['meta']

/** What the field was declared with, or the wide shape when it isn't known. */
type DeclaredOf<F extends AnyFields, K extends keyof F> =
  NonNullable<F[K]['__declared']>

/**
 * Which extras this field can produce AT ALL. A key nobody declared is absent
 * from the bindings rather than optional — that's the difference between
 * `register('username').options` being `undefined` and being a compile error.
 *
 * `options` has two sources, the declaration and a rule, and a rule can be
 * attached from anywhere at any time. So a field whose declaration has no list
 * still gets the key IF something could derive one — which, unlike the builder,
 * cannot be settled from the types here. The declaration is what's answerable,
 * and it is what the check uses.
 */
type DeclaredExtras<F extends AnyFields, K extends keyof F> =
  | ('placeholder' extends keyof DeclaredOf<F, K> ? 'placeholder' : never)

/** Flattens an intersection into one object, so a hover shows the shape and not the seams. */
export type Prettify<T> = { [K in keyof T]: T[K] } & {}

/** What an input component receives from `register(key)`. */
export type FieldBindings<F extends AnyFields, K extends keyof F & string> = Prettify<
  {
    name: K
    label: string
    modelValue: F[K]['value']
    /**
     * Widened deliberately, twice. With `| undefined`, because a component
     * declaring `defineModel<string>()` emits `string | undefined`. And from a
     * literal union to its primitive, because a generic select typed `string`
     * emits `string` — under `strictFunctionTypes` a handler taking only
     * `'PF' | 'PJ' | ''` is not assignable to it, and `v-bind` on the most common
     * select stops compiling. `modelValue` stays narrow: that direction is safe.
     */
    'onUpdate:modelValue': (value: WidenLiteral<F[K]['value']> | undefined) => void
  }
  & Pick<FieldExtras, DeclaredExtras<F, K>>
  /**
   * Required, not optional, for a field that declared options: it is a choice,
   * so the component rendering it is a select that needs the list — even while
   * the list is still empty.
   */
  & (HasOptions<F, K> extends true ? { options: ReadonlyArray<FieldOption<OptionValue<F[K]['value']>>> } : unknown)
  /**
   * Minus the v-model contract: the engine sets those last, so an augmentation
   * declaring them would type a key the component never actually receives.
   */
  & Omit<CustomFieldBindings<F, K>, ContractKey>
>

/** Everything the engine derives from a fields object. */
export interface FormEngine<F extends AnyFields> {
  fields: F
  values: ComputedRef<ValuesOf<F>>
  /** Only what a rule is currently letting through. */
  visible: ComputedRef<Partial<ValuesOf<F>>>
  canShow: ComputedRef<{ [K in keyof F]: boolean }>
  /**
   * Where the friendly text comes from: `form.selected.region?.label`.
   *
   * On the engine rather than only on the field object, so reaching it doesn't
   * require the raw fields — that was the one thing consumers needed them for.
   */
  selected: ComputedRef<SelectedOptions<F>>
  options: ComputedRef<{ [K in keyof OptionFields<F>]: ReadonlyArray<FieldOption<OptionValue<F[K]['value']>>> }>
  /** Validators for the visible fields, with the types you declared. */
  shape: ComputedRef<Record<string, unknown>>
  /**
   * The same validators handed to the project's own combinator, already
   * reactive. Composing outside a `computed` freezes the schema at its first
   * value, so a field a rule hides later stays required.
   */
  composeSchema: <T>(combine: (shape: Record<string, never>) => T) => ComputedRef<T>
  validate: () => Promise<ValidationResult<ValuesOf<F>>>
  /**
   * One field, for validating as the user leaves it. Hidden, or without a
   * validator, it is valid — the same answer `validate()` gives for it.
   */
  validateField: (key: keyof F & string) => Promise<FieldValidationResult>
  register: <K extends keyof F & string>(key: K) => FieldBindings<F, K>
  set: (patch: Partial<ValuesOf<F>>) => void
  reset: () => void
  dispose: () => void
}

/** The reserved key the setup uses to hand its fields to the engine. */
export interface SetupResult {
  fields: AnyFields
}

/** Everything the setup returned except the fields, exposed untouched. */
export type Exposed<S> = Omit<S, 'fields'>

export type { BuiltFields, FieldObj, FieldsInput }
