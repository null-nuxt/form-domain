<script setup lang="ts">
import { computed } from 'vue'
import { object, string } from 'yup'
import type { FieldsInput } from '#forms'

/**
 * Type fixture for the domain. Every `@ts-expect-error` here is a guarantee: if
 * one stops holding, the directive goes unused and typecheck fails.
 */

const declared = refFields({
  username: { label: 'Username', value: '' },
  personType: { label: 'Type', value: '' as 'PF' | 'PJ' | '' },
  profile: {
    label: 'Profile',
    value: '',
    placeholder: 'pick one',
    options: [{ label: 'Lawyer', value: 'adv' }],
  },
})

addRules(declared, {
  username: { canShow: () => declared.personType.value === 'PF', clearWhenHidden: true },
})

// @ts-expect-error a field that isn't in fields
addRules(declared, { surname: { canShow: () => true } })

addSchemas(declared, { username: string().required() })

// @ts-expect-error validating a field that doesn't exist makes no sense
addSchemas(declared, { surname: string().required() })

const form = toForm(declared)

/** The value keeps its declared union, all the way through `values`. */
const personType: 'PF' | 'PJ' | '' = form.values.value.personType
void personType

// @ts-expect-error a field outside fields
form.register('surname')

/** A field that declares extras gets the keys... */
void form.register('profile').options
void form.register('profile').placeholder

// @ts-expect-error ...and one that declares none gets nothing
void form.register('username').options

// @ts-expect-error same for placeholder
void form.register('username').placeholder

/** The handler has to serve a component declaring `defineModel<string>()`. */
const handler: (value: string | undefined) => void = form.register('username')['onUpdate:modelValue']
void handler

/** `shape` keeps yup's own type, so it composes. */
const schema = form.composeSchema(object)
void schema.value.describe

/**
 * Only a field that declared `options` is a choice — so only those appear in
 * `options` and `selected`. Before this, both listed EVERY field, typing a plain
 * text input as though it might hold one.
 */
void form.options.value.profile
void form.selected.value.profile

// @ts-expect-error `username` declared no options, so it is not a choice
void form.options.value.username

// @ts-expect-error and it can never have a selected one
void form.selected.value.username

/**
 * Declaring the list is also what lets a rule derive it — and the bare `[]`
 * needs no annotation, because the derived list is typed from the field's value
 * rather than from what the declared array held.
 */
const withChoice = refFields({
  state: { label: 'State', value: '' },
  city: { label: 'City', value: '', options: [] },
})

addRules(withChoice, {
  city: { deriveOptions: () => withChoice.state.value ? [{ label: 'Recife', value: 'recife' }] : [] },
})

/**
 * The bare `[]` carries no annotation, and the derived list is still typed from
 * the field's value. If that ever stops being true the cast comes back, so it is
 * pinned here rather than left to be rediscovered.
 */
const narrowed = refFields({
  kind: { label: 'Kind', value: '' as 'a' | 'b' | '', options: [] },
})

addRules(narrowed, { kind: { deriveOptions: () => [{ label: 'A', value: 'a' as const }] } })

const narrowedChoice: 'a' | 'b' | '' | undefined = toForm(narrowed).selected.value.kind?.value
void narrowedChoice

addRules(withChoice, {
  // @ts-expect-error `state` never said it holds a choice, so it gets no options
  state: { deriveOptions: () => [] },
})

/**
 * The singular form gates it the same way. The same mistake must not compile
 * through one and fail through the other — which it did until this was pinned.
 */
addRule(withChoice.city, { deriveOptions: () => [{ label: 'Recife', value: 'recife' }] })

// @ts-expect-error `state` declared no options, so the singular form refuses too
addRule(withChoice.state, { deriveOptions: () => [] })

/**
 * The name differs from the declaration's `options` because the SHAPES differ:
 * an array there, a function here. Sharing the name would invite writing the
 * array form in a rule and finding out from a type error.
 */
addRules(withChoice, {
  // @ts-expect-error the derived list is a function, not an array
  city: { deriveOptions: [{ label: 'Recife', value: 'recife' }] },
})

/**
 * A field annotated with a union keeps it once it declares options. It used to
 * widen to `string`: the options' literals widen on their own, and the field's
 * value was unioned with them — so `values` lost the very type the annotation
 * existed to give.
 */
const withUnionChoice = toForm(refFields({
  kind: {
    label: 'Kind',
    value: '' as 'PF' | 'PJ' | '',
    options: [{ label: 'Individual', value: 'PF' }, { label: 'Company', value: 'PJ' }],
  },
}))

const unionKept: 'PF' | 'PJ' | '' = withUnionChoice.values.value.kind
void unionKept

// @ts-expect-error 'XX' is not one of the declared kinds
const unionRejects: typeof withUnionChoice.values.value.kind = 'XX'
void unionRejects

/**
 * Keeping the union surfaced what erasing it hid: a select typed `string` emits
 * any `string`, and a handler taking only the union isn't assignable to it. So
 * the handler widens to the primitive while `modelValue` stays narrow — the
 * binding fits the most common select without the field losing its type.
 */
const unionHandler: (value: string | undefined) => void = withUnionChoice.register('kind')['onUpdate:modelValue']
const unionModel: 'PF' | 'PJ' | '' = withUnionChoice.register('kind').modelValue
void unionHandler
void unionModel

/**
 * A field declared as bare `null` has no type of its own, so there the options
 * are what say what it holds: `string | null`, not `null`.
 */
const fromNull = toForm(refFields({
  state: { label: 'State', value: null, options: [{ label: 'SP', value: 'SP' }] },
}))

const fromNullValue: string | null = fromNull.values.value.state
void fromNullValue

// @ts-expect-error a number is not what those options hold
const fromNullRejects: typeof fromNull.values.value.state = 1
void fromNullRejects

/** `selected` comes off the engine, with no need for the raw fields. */
const chosen: string | undefined = form.selected.value.profile?.label
void chosen

// @ts-expect-error a field outside fields
void form.selected.value.surname

/** `visible` is partial; `values` is complete. */
const partial: string | undefined = form.visible.value.username
const complete: string = form.values.value.username
void partial
void complete

/**
 * An option's value has to match the field carrying it. That held through
 * `refField()` and NOT through `refFields()` — the common path — because the
 * record is keyed with `any`. Without it the select renders choices that can
 * never match: `selected` never resolves and a `oneOf` rejects everything the
 * user picks.
 */
refFields({
  // @ts-expect-error the field holds a string; this option holds a number
  quantity: { label: 'Quantity', value: '', options: [{ label: 'One', value: 1 }] },
})

refFields({
  quantity: {
    label: 'Quantity',
    value: '' as 'one' | 'two' | '',
    // the field's union accepts an option from the same union
    options: [{ label: 'One', value: 'one' as const }],
  },
})

/**
 * A multi-choice field holds an array, and each option is ONE entry of it —
 * checkbox groups and multi-selects. `null` means "nothing chosen", never a
 * choice, so a nullable select still lists plain values.
 */
const choices = toForm(refFields({
  services: { label: 'Services', value: [] as string[], options: [{ label: 'Mail', value: 'mail' }] },
  state: { label: 'State', value: null as string | null, options: [{ label: 'SP', value: 'SP' }] },
}))

const chosenServices: string[] = choices.selected.value.services.map(option => option.value)
const stateOptions: ReadonlyArray<{ label: string, value: string }> = choices.register('state').options
void chosenServices
void stateOptions

refFields({
  // @ts-expect-error the field holds strings; this option holds a number
  tags: { label: 'Tags', value: [] as string[], options: [{ label: 'One', value: 1 }] },
})

/**
 * Nullable AND multi-choice. `null` has to come off before asking whether the
 * value is an array — the other way round, the declaration below was rejected
 * and its options were typed with the whole array.
 */
const nullableTags = toForm(refFields({
  tags: { label: 'Tags', value: null as string[] | null, options: [{ label: 'Mail', value: 'mail' }] },
}))

const nullableTagOptions: ReadonlyArray<{ label: string, value: string }> = nullableTags.options.value.tags
const nullableTagsChosen: string[] | undefined = nullableTags.selected.value.tags?.map(option => option.value)
void nullableTagOptions
void nullableTagsChosen

/**
 * The v-model contract belongs to the engine. An extender returning one of its
 * keys used to win, and typing stopped reaching the field in silence.
 */
extendFormBindings(field => ({ label: `${field.label}*` }))()

// @ts-expect-error an extender cannot replace the v-model handler
extendFormBindings(() => ({ 'onUpdate:modelValue': () => {} }))()

// @ts-expect-error nor the value it binds
extendFormBindings(() => ({ modelValue: 'fake' }))()

/**
 * Fragments compose as DECLARATIONS, before anything is built. The merged record
 * is flat, its keys are known, and — because building happens after — every
 * field is typed with the whole tree instead of with the fragment it came from.
 */
const customerFragment = { name: { label: 'Name', value: '' } }
const addressFragment = { cep: { label: 'CEP', value: '' }, city: { label: 'City', value: '' } }

const merged = refFields(mergeFields([customerFragment, addressFragment]))
const mergedForm = toForm(merged)

void mergedForm.register('cep').name

// @ts-expect-error no fragment declared this key
void mergedForm.register('nope')

/** A rule declared in one fragment reaches a key from another. */
addRule(merged.cep, { onChange: (value, ctx) => ctx.patch({ city: value }) })

addRule(merged.cep, {
  // @ts-expect-error and still only the keys that exist
  onChange: (value, ctx) => ctx.patch({ nope: value }),
})

/** The same key twice is the later fragment winning, not a merge. */
mergeFields([
  { cpf: { label: 'CPF', value: '' } },
  // @ts-expect-error `cpf` was already declared by an earlier fragment
  { cpf: { label: 'Document', value: '' } },
])

/**
 * A fragment whose keys aren't known would give the merged record an index
 * signature, and from there every key compiles.
 */
const dynamicFragment: FieldsInput = { whatever: { label: 'X', value: '' } }

// @ts-expect-error this fragment's keys are not known here
mergeFields([customerFragment, dynamicFragment])

/** A standalone field sits next to the declarations and keeps its precision. */
const sharedCpf = refField({ label: 'CPF', value: '', meta: { mask: 'cpf' } })
const withStandalone = toForm(refFields({ cpf: sharedCpf, name: { label: 'Name', value: '' } }))

/**
 * `meta` arrives typed as declared, and a field that declared none has none — the
 * project reads it without casting, and can't read a key nobody put there.
 */
const declaredMask: string = withStandalone.fields.cpf.meta.mask
void declaredMask

// @ts-expect-error `name` declared no meta
void withStandalone.fields.name.meta.mask

/**
 * The playground augments `CustomFieldBindings` with `mask` (plugins/form-bindings.ts),
 * so `register()` is typed with it — the runtime extender and the type go together.
 */
const boundMask: string | undefined = withStandalone.register('cpf').mask
void boundMask

// @ts-expect-error the standalone field declared no placeholder
void withStandalone.register('cpf').placeholder

/** Domain: metadata comes off the factory, with no instance. */
const domain = defineFormDomain('domain-guard', { title: 'Guarda', order: 1 }, () => {
  const f = refFields({ name: { label: 'Name', value: '' } })
  return { fields: f, shouted: computed(() => f.name.value.toUpperCase()) }
}).payload(ctx => ({ ...ctx.visible, shouted: ctx.shouted.value }))

const title: string = domain.metadata.title
void title

const instance = domain()

/** What the setup exposed beyond the fields arrives typed. */
const shouted: string = instance.shouted.value
void shouted

/** And the projection keeps the type of what was projected. */
const projected: string = instance.payload.value.shouted
void projected

// @ts-expect-error the payload declares no such key
void instance.payload.value.doesNotExist

/** Metadata is optional. */
const noMetadata = defineFormDomain('domain-guard-no-metadata', () => ({
  fields: refFields({ name: { label: 'Name', value: '' } }),
}))

const name: string = noMetadata().values.value.name
void name
</script>

<template>
  <div>
    <!-- the case that started it all: v-bind onto a defineModel<string>() component -->
    <ModelInput v-bind="form.register('username')" />
    <ModelInput v-bind="form.register('profile')" />
    {{ personType }} {{ partial }} {{ complete }} {{ title }} {{ shouted }} {{ projected }} {{ name }}
  </div>
</template>
