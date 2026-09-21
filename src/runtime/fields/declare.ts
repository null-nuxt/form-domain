import { markRaw, reactive } from 'vue'
import type { FieldOption, OptionValue, Prettify, SelectedOf } from '../types'

/**
 * What a field is declared with. Structure only — anything that depends on the
 * form's state is a rule, because at declaration time there is no state yet.
 */
export interface FieldInput<TValue> {
  label: string
  value: TValue
  placeholder?: string
  options?: ReadonlyArray<FieldOption<OptionValue<TValue>>>
  /**
   * Whatever the project wants to carry on the field — a mask name, an icon, a
   * width. The engine stores it and types it; it never reads it. See `extendFormBindings`.
   */
  meta?: Record<string, unknown>
}

/**
 * The behaviour a rule attaches to a field. Written by `addRule`/`addRules`
 * onto the field itself, which is what keeps registration from needing an
 * ambient "current form" — the field IS the target.
 */
export interface FieldRule<TValue, TValues> {
  canShow?: () => boolean
  clearWhenHidden?: boolean
  /**
   * The derived list, which wins over the one declared on the field.
   *
   * Named apart from the declaration's `options` because the shapes differ —
   * there an array, here a function returning one. The same name on both would
   * invite writing `options: [{ label, value }]` in a rule and finding out from
   * a type error.
   */
  deriveOptions?: () => ReadonlyArray<FieldOption<OptionValue<TValue>>>
  onChange?: (value: TValue, ctx: { patch: (values: Partial<TValues>) => void }) => void | Promise<void>
}

/**
 * A live field: reactive `value` plus the declaration, plus the slots the
 * registration functions write into.
 *
 * `key` is filled at assembly, not here: a field doesn't know its own name
 * until it is put into a form, and `refField()` has to work for a field declared
 * on its own to be reused across domains.
 */
export interface FieldObj<TValue, TValues = Record<string, unknown>, TDeclared = FieldInput<TValue>> {
  /**
   * The declaration AS WRITTEN, kept only as a type. `register()` reads it to
   * know whether this field declares `options` or `placeholder` at all, and
   * `meta` is typed from it — the interface below has them optional, so it
   * cannot answer that.
   */
  readonly __declared?: TDeclared
  label: string
  value: TValue
  key: string
  placeholder?: string
  /**
   * What the declaration put in `meta`, typed as declared — `undefined` for a field
   * that declared none. Static: stored raw, so a component or a schema in it is not
   * turned into a reactive proxy.
   */
  readonly meta: 'meta' extends keyof TDeclared ? TDeclared['meta' & keyof TDeclared] : undefined
  /** The static list from the declaration; a rule's list wins over it. */
  declaredOptions?: ReadonlyArray<FieldOption<OptionValue<TValue>>>
  /** Written by `addRule`. Read by the engine. */
  rule?: FieldRule<TValue, TValues>
  /**
   * Written by `addStepRules`: the group this field belongs to — a wizard step
   * — can be skipped, and a field in a skipped group is hidden with it.
   *
   * A slot of its own rather than the rule's `canShow`, because the two answer
   * different questions and a field has one rule: "does this field apply" is
   * the field's, "does this part of the form apply at all" is the group's.
   */
  groupCanShow?: () => boolean
  /** Written by `addSchema`. A getter when the validator depends on state. */
  schema?: unknown
  /**
   * The message worth showing for this field right now, or nothing.
   *
   * Written by a session and by nothing else: WHEN a message is worth showing —
   * after a submit was attempted, until the value it spoke about changes — is
   * the session's policy, and the field is where everyone can read the answer.
   * The engine never writes here, so `validate()` stays a question you ask
   * rather than a state you keep.
   *
   * Nothing reaches the component on its own. A project maps it onto whatever
   * prop its input declares, with `extendFormBindings` — the same way it maps
   * `meta.mask`. An input that declares none gets nothing.
   */
  error?: string
  /** The option matching the current value — or the options, for a multi-choice field. */
  readonly selected: SelectedOf<TValue>
  /** Marks the object as a field so the engine can tell it from anything else. */
  readonly __isFormField: true
}

/**
 * The shape handed to `reactive()`. Named rather than inlined so `this` inside
 * the getter has a type — in an inline literal it widens to `never`.
 */
interface ReactiveSource<TValue> {
  label: string
  value: TValue
  key: string
  placeholder?: string
  readonly meta: Record<string, unknown> | undefined
  declaredOptions?: ReadonlyArray<FieldOption<OptionValue<TValue>>>
  rule?: FieldRule<TValue, Record<string, unknown>>
  groupCanShow?: () => boolean
  schema?: unknown
  error?: string
  readonly selected: SelectedOf<TValue>
  readonly __isFormField: true
}

/** The reactive object a field actually is, before it knows its name. */
const createField = <TValue>(input: FieldInput<TValue>): FieldObj<TValue> => {
  const { options, meta, ...rest } = input

  const source: ReactiveSource<TValue> = {
    ...rest,
    meta: meta ? markRaw(meta) : undefined,
    key: '',
    declaredOptions: options,
    /**
     * Derived, never stored. Storing the label freezes it: change the list and
     * the text goes stale — which is the whole reason the field keeps only the
     * value.
     *
     * `this` is the reactive proxy when read through it, so the reads inside
     * are tracked.
     */
    get selected(): SelectedOf<TValue> {
      const list = this.rule?.deriveOptions ? this.rule.deriveOptions() : this.declaredOptions
      const current: unknown = this.value

      // a multi-choice field: every option it holds, in the list's order
      if (Array.isArray(current)) {
        return (list ?? []).filter(option => current.includes(option.value)) as SelectedOf<TValue>
      }
      return list?.find(option => option.value === current) as SelectedOf<TValue>
    },
    __isFormField: true,
  }

  return reactive(source) as FieldObj<TValue>
}

/**
 * One field, on its own. Use it for a field worth reusing across domains — a
 * CPF with its validator and its meta — and hand it to `refFields()` alongside the
 * plain declarations.
 *
 * `ref` rather than `use`: this creates reactive state, the way `ref()` does,
 * which is exactly why calling it at module scope is suspect. `use` would say
 * "composable", which it isn't — and vee-validate already owns `useField`.
 *
 * The parameter is `TInput & { value: TValue }` rather than plain `TInput` so
 * `TValue` gets its own inference site. Inferred from the constraint alone it
 * would collect a candidate from the options too and widen, silently dropping
 * the guarantee that an option's value matches the field's.
 */
export const refField = <TValue, TInput extends FieldInput<TValue> = FieldInput<TValue>>(
  input: TInput & { value: TValue },
): FieldObj<TInput['value'], Record<string, unknown>, TInput> =>
  createField(input) as FieldObj<TInput['value'], Record<string, unknown>, TInput>

/** A field object, or the declaration to build one from. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FieldSource = FieldObj<any> | FieldInput<any>

export type FieldsInput = Record<string, FieldSource>

/**
 * The value a source carries, whether it arrived built or as a declaration.
 *
 * Read off `value` and the options' values explicitly: `options` is typed through
 * `OptionValue`, a conditional TypeScript can't infer back from.
 *
 * The declared value wins. Options only supply the type when the value has none
 * of its own — declared as bare `null` — so `{ value: null, options: [...] }` holds
 * `string | null`. Unioning them otherwise undid an annotation: the options'
 * literals widen to `string` on their own, and `'PF' | 'PJ' | ''` came out as
 * `string`. Letting the value win costs nothing, since `CheckedFields` already
 * refuses an option outside it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ValueOfSource<T> = T extends FieldObj<any>
  ? T['value']
  : T extends { value: infer V, options: ReadonlyArray<{ value: infer OV }> }
    ? [NonNullable<V>] extends [never]
        // a bare `[]` infers nothing for its options, which must not widen the field
        ? [OV] extends [never] ? V : unknown extends OV ? V : V | OV
        : V
    : T extends { value: infer V } ? V : never

/** What the source declared, so the extras stay answerable after assembly. */
export type DeclaredOfSource<T> = T extends FieldObj<infer _V, infer _Vs, infer D> ? D : T

/**
 * Each entry checked against ITSELF: an option's value has to match the value
 * its own field holds.
 *
 * `FieldsInput` can't express this. Entries have different value types from one
 * another, so the record is keyed with `any`, and `any` is what switched the
 * check off — a field holding a string accepted options holding numbers. The
 * select would then render choices that can never match, `selected` would never
 * resolve, and a `oneOf` schema would reject everything the user picked.
 *
 * The intersection with the input is the same double defence `OnlyKnownKeys`
 * uses: on a mismatch the option's value type collapses to `never`, and the
 * error lands on the offending value rather than on the whole object.
 *
 * Already-built fields carry `declaredOptions`, not `options`, so they skip the
 * check — it already ran in `refField`.
 */
export type CheckedFields<T> = {
  [K in keyof T]: T[K] extends { value: infer V, options: ReadonlyArray<{ value: infer OV }> }
    ? [OV] extends [OptionValue<V>] ? T[K] : { options: ReadonlyArray<FieldOption<OptionValue<V>>> }
    : T[K]
}

/**
 * No constraint on `T`: a declaration merged inside a generic — a wizard's
 * steps, say — is a conditional type TypeScript cannot yet prove is a
 * `FieldsInput`, and the body here never needed the proof. What is passed is
 * still checked where it is built.
 */
export type BuiltFields<T> = {
  [K in keyof T]: FieldObj<
    ValueOfSource<T[K]>,
    { [K2 in keyof T]: ValueOfSource<T[K2]> },
    DeclaredOfSource<T[K]>
  >
}

/**
 * One fragment, checked against the keys the fragments before it already
 * declared.
 *
 * Two fragments declaring the same key is not a merge, it is the later one
 * winning. Spreading picks it silently, which is the kind of quiet the rest of
 * this module exists to remove — so the later one is what fails, since it is
 * the one doing the overriding.
 *
 * A fragment typed as the wide `FieldsInput` is refused for a different reason:
 * its keys are not known, so the merged record gets an index signature, and
 * from there `register('anything')` compiles. The check would be passing by
 * accepting everything.
 *
 * The offending fragment is what collapses, the same double defence
 * `CheckedFields` uses, so the error lands on it rather than on the whole call.
 */
export type CheckedFragment<T, Seen> = string extends keyof T
  ? { __fieldKeysNotKnown: 'this fragment\'s keys are not known here, so the merged fields would accept any key — pass a concrete declaration' }
  : [keyof T & Seen] extends [never]
      ? T
      : { __duplicateFieldKey: `already declared by an earlier fragment: ${Extract<keyof T & Seen, string>}` }

/** Each fragment against the ones before it, carrying their keys along. */
export type CheckedFragments<T extends readonly FieldsInput[], Seen = never> =
  T extends readonly [infer First, ...infer Rest extends readonly FieldsInput[]]
    ? [
        CheckedFragment<First, Seen>,
        ...CheckedFragments<Rest, Seen | (string extends keyof First ? never : keyof First)>,
      ]
    : []

type Intersected<T extends readonly unknown[]> =
  T extends readonly [infer First, ...infer Rest] ? First & Intersected<Rest> : unknown

/** The fragments as one declaration, flattened — the composition leaves no trace. */
export type MergedFields<T extends readonly FieldsInput[]> = Prettify<Intersected<T>>

/**
 * Composes declaration fragments into one declaration.
 *
 * Fragments, not forms: what gets merged is inert data, and only then does
 * `refFields()` build it. That ordering is the whole point. Merging what was
 * already built would hand two forms the same reactive field — the leak
 * `claimFields` now catches — and it would also leave each field typed with the
 * value map of the fragment it came from, so a rule from one slice could not
 * patch a key from another. Built after merging, every field knows the whole
 * tree.
 *
 * There is no runtime check for a repeated key. The types can see it, and this
 * module only spends runtime warnings on what they cannot.
 */
export const mergeFields = <T extends readonly FieldsInput[]>(
  fragments: [...T] & CheckedFragments<T>,
): MergedFields<T> => Object.assign({}, ...fragments) as MergedFields<T>

/**
 * Declares fields without building them.
 *
 * It returns exactly what it was given — the point is not what it does at
 * runtime, it is what it does while you type: the editor completes `label`,
 * `value`, `options` and `meta`, and an option whose value doesn't match its
 * field fails HERE, in the file that declared it, instead of at whichever form
 * later picked the fragment up.
 *
 * A bare object literal still works and stays the simplest thing that can
 * work. This is for a fragment meant to be reused, where the mistake would
 * otherwise surface far from the file that made it.
 */
export const defineFields = <T extends FieldsInput>(declaration: T & CheckedFields<T>): T =>
  declaration as T

/**
 * The form's fields, named. This is where a field learns its own key, so the
 * template never repeats the name next to the field.
 *
 * Accepts a declaration or an already-built `refField()`, so a shared field drops
 * in next to inline ones.
 */
export const refFields = <T extends FieldsInput>(input: T & CheckedFields<T>): BuiltFields<T> => {
  const result: Record<string, unknown> = {}

  for (const [key, source] of Object.entries(input)) {
    const built = isField(source) ? source : createField(source)
    built.key = key
    result[key] = built
  }

  return result as BuiltFields<T>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isField = (value: unknown): value is FieldObj<any> =>
  typeof value === 'object' && value !== null && '__isFormField' in value
