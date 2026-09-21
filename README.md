# @null-nuxt/form-domain

A form declared as a **setup function** — fields, rules, validation and the
payload — consumed through composables, in the style of `defineStore`.

Schema-library agnostic: anything implementing
[Standard Schema](https://standardschema.dev) works — Zod, Valibot, ArkType,
yup 1.7+.

## Installation

```bash
pnpm add "github:null-nuxt/form-domain#v0.1.0"
```

Pin a tag for reproducible installs. Dropping it resolves to whatever `main`
points at.

Not published to npm — installed straight from the repository. The consuming
project must allow the package to build on install:

```yaml
# pnpm-workspace.yaml
allowBuilds:
  "@null-nuxt/form-domain": true
```

Approving a git package **by name** only works on pnpm 11.15 and up; before
that the key had to carry the resolved commit hash, which changes on every
update.

```ts
export default defineNuxtConfig({
  modules: ['@null-nuxt/form-domain'],
})
```

## A form inside a component

There is no wrapper to write. `<script setup>` is already the scope, so the
fields are consts, anything derived is a `computed`, and the form is assembled
at the end:

```vue
<script setup lang="ts">
import { object, string } from 'yup'

const campos = refFields({
  name: { label: 'Full name', value: '' },
  personType: {
    label: 'Type',
    value: '' as 'individual' | 'company' | '',
    options: [
      { label: 'Individual', value: 'individual' },
      { label: 'Company', value: 'company' },
    ],
  },
  ein: { label: 'Company number', value: '' },
})

const isCompany = computed(() => campos.personType.value === 'company')

addRule(campos.ein, { canShow: () => isCompany.value, clearWhenHidden: true })

addSchemas(campos, {
  name: string().required(),
  personType: string().required(),
  ein: string().required(),
})

const { register, canShow, values, composeSchema } = toForm(campos)
const schema = composeSchema(object)
</script>

<template>
  <MyInput v-bind="register('name')" />
  <MySelect v-bind="register('personType')" />
  <MyInput v-if="canShow.ein" v-bind="register('ein')" />
</template>
```

## A shared domain

A domain has no component to live in, so it gets a setup of its own. Put it
under `<srcDir>/forms` and it is discovered automatically:

```ts
// forms/federal-court/index.ts
export const metadata = {
  title: 'Criminal Record Certificate',
  to: '/services/certificates/federal-court',
  category: 'certificates',
  order: 120,
}

export default defineFormDomain('federal-court', metadata, () => {
  const campos = createFields()

  documento(campos)   // one file per block
  regiao(campos)

  const isPF = computed(() => campos.tipoPessoa.value === 'PF')

  return {
    fields: campos,
    isPF,
    price: computed(() => isPF.value ? 59.9 : 89.9),
  }
})
  .payload(ctx => ({
    ...ctx.visible,
    region_label: ctx.fields.regiao.selected?.label ?? '',
    price: ctx.price.value,
  }))
```

`metadata` is optional: `defineFormDomain(id, setup)` works too.

The setup returns its fields under the reserved `fields` key. **Everything else
it returns is exposed untouched** — nothing is classified, because the engine
only needs to know which of them are the fields.

## Why a setup and not a builder

This package used to be a `withFields().withFacts().withRules()` chain, and the
chain existed for one reason: inside a single object literal TypeScript infers
every property at once, so `rules` could not see the inferred type of `facts`.

A setup has no literal. Each line is a declaration and inference runs top to
bottom, so the limitation is gone rather than worked around — and with it the
eight type parameters, the `RulesOf`/`SchemaOf`/`OutcomeOf` helpers a consuming
project had to import, and a whole class of ordering mistakes.

## The names, and what each prefix promises

Every prefix already means something in Vue, so the name teaches rather than
labels:

| prefix | in Vue | here |
|---|---|---|
| `ref*` | creates reactive state | `refField`, `refFields` |
| `to*` | derives one shape from another | `toForm` |
| `define*` | declares a thing to use later | `defineFormDomain` |
| `use*` | consumes a declared thing, in a component | `useFormDomain`, `useFormDomains` |

`refFields` rather than `useFields` for two reasons. It creates reactive state
the way `ref()` does — which is exactly why calling it at module scope is
suspect — whereas `use` would claim it's a composable, which it isn't. And
`useField` is already vee-validate's, an import most projects using this will
also have.

`toForm` rather than `createForm` because `create*` in this package used to mean
a builder you had to terminate, and because `useForm` is vee-validate's too.

`add*` sits outside the table on purpose: registration is neither creation nor
derivation, and `add` says so without borrowing anyone's meaning.

## Registration takes its target

```ts
addRule(campos.ein, { canShow: () => isCompany.value })
addRules(campos, { ein: { canShow: () => isCompany.value } })
```

The field is the argument, so nothing needs to know which form is "current".
That is what keeps this callable from anywhere — including another file —
without the hazards an ambient registry brings, and it is why the rules stay a
separable layer: grouping the calls elsewhere is still a rules file.

The keyed form takes a **direct argument** rather than something returned. Both
reject a field that doesn't exist, but from an arrow's return the error lands on
the whole function instead of the offending key.

## Rules

| | what it does |
|---|---|
| `canShow` | hides the field, and drops it from validation |
| `clearWhenHidden` | resets it to its initial value once hidden |
| `deriveOptions` | a derived list; wins over the one declared on the field, and only for a field that declared one |
| `onChange` | a side effect, writing through `ctx.patch()` |

`canShow` returning false removes the field from validation. That's what erases
most `.when()` calls: the condition was stated once.

`clearWhenHidden` is opt-in because it erases data — in a multi-step form a
hidden field usually needs to keep what the user typed.

`onChange` writes through `ctx.patch()`, which is a **request**: the engine only
applies it if that invocation is still the most recent one, so a slow lookup
can't overwrite newer input.

## Validation

One validator per field, not a composed schema:

```ts
addSchemas(campos, {
  name: string().required('Name is required'),
  // a getter when it depends on the form's state
  regiao: () => string().oneOf(valoresValidos(campos)).required(),
})
```

A plain validator is read once, which is right when it never changes and wrong
when it does — hence the getter form.

A validator is told from a getter by the Standard Schema marker, `~standard`,
not by being a function — ArkType's types are functions, and taking one for a
getter called it with no argument.

```ts
const { valid, errors, firstErrors } = await form.validate()
const { valid, errors } = await form.validateField('cpf')   // one field, e.g. on blur
```

`validateField` resolves visibility and the getter form the same way
`validate()` does, so a field checked on blur can't disagree with the same field
checked on submit: hidden, or without a validator, it is valid.

If your form library wants a composed schema, hand it your combinator:

```ts
const schema = form.composeSchema(object)    // yup
const schema = form.composeSchema(z.object)  // zod
```

Which library composes is your call. The **reactivity** isn't, and that's why
this is a method: composing outside a `computed` freezes the schema at its first
value, so a field a rule hides later stays required — a bug that only shows up
on the branch that hides something.

### Submitting is not this module's job

There is deliberately no `onSubmit` or `onSchemaError`. The module provides
schema and state; running validation and submission belongs to your form
library — vee-validate, FormKit, or your own wrapper.

## `register()` builds the input props

```vue
<MyInput v-bind="form.register('name')" />
```

It provides `name`, `label`, `modelValue` and the `update:modelValue` handler,
plus `options` and `placeholder` **only when the field declares them** —
and that is a statement about the type, not just the runtime object:

```ts
form.register('perfil').options   // ok, this field declares a list
form.register('name').options     // ✗ this field declares none
```

The handler accepts the field's value widened — `TValue | undefined`, and a
literal union such as `'PF' | 'PJ'` widened to `string`. A component written the
ordinary way emits the wider type:

```ts
const model = defineModel<string>()  // emits string | undefined
```

Under `strictFunctionTypes` a handler taking only `string` is **not** assignable
to that, and `v-bind` would fail to compile on the most common way to write an
input. The same goes for a select typed `string` bound to a field
annotated `'PF' | 'PJ' | ''`. `modelValue` stays exactly as declared, so the field
keeps its type; only the direction the component writes back in is widened, and
what it writes is what the field stores.

## `meta`: what the project carries on a field

The engine knows form concepts — value, label, options, visibility, validation.
Anything else a project wants on a field goes in `meta`, typed as declared:

```ts
refFields({
  cpf: { label: 'CPF', value: '', meta: { mask: 'cpf', width: 2 } },
  name: { label: 'Name', value: '' },
})

form.fields.cpf.meta.mask    // string
form.fields.name.meta.mask   // ✗ this field declared no meta
```

The engine stores it and never reads it, and `register()` never sends it: a key
the component doesn't declare lands as a DOM attribute. `meta` is static and kept
raw, so a component or an object inside it doesn't become a reactive proxy.

There used to be a `mask` key. It was the project's concern — which masks exist,
and which component applies them — so it became `meta.mask` plus an extender.

## Extending `register()`

A project maps `meta` (or anything on the field) onto its own components with an
extender, registered from a plugin. It runs per request under SSR, like the
registry, so a plugin re-running doesn't stack copies:

```ts
// plugins/form-bindings.ts
export default defineNuxtPlugin(() => {
  extendFormBindings((field, { key }) =>
    field.meta?.mask ? { mask: field.meta.mask } : undefined,
  )
})
```

That is the runtime half. For `register()` to be **typed** with the new key,
augment `CustomFieldBindings` — generic over the form and the key, the way
Pinia's `PiniaCustomProperties` is, so a key can depend on the field:

```ts
declare module '#forms' {
  interface CustomFieldBindings<F extends AnyFields, K extends keyof F> {
    mask?: string
  }
}
```

An extender may add keys or override a default one — `label`, `placeholder`,
`options` (a translated `label`, say). It can't touch the v-model contract:
`name`, `modelValue` and `onUpdate:modelValue` are set after every extender has
run, returning one is a compile error, and in dev it logs a warning if it slips
through a cast. Letting an extender replace the handler used to stop typing from
reaching the field, silently.

A component that takes `value` and `onChange` instead of `v-model` is better
served by a small adapter in the project, which stays explicit and fully typed.

## Only declared choices are choices

A field says it holds a choice by declaring `options` — an empty list counts,
and is how you say "this is a select, the list comes later":

```ts
refFields({
  name: { label: 'Name', value: '' },
  city: { label: 'City', value: '', options: [] },
})
```

The bare `[]` needs no annotation. It infers as `never[]` and nothing reads it:
the derived list and `form.options` are typed from the FIELD's value, never from
whatever the declared array held.

That marker does two things. It lets a rule derive the list — `addRules` rejects
`deriveOptions` on a field that never declared any — and it keys `form.options`
and `form.selected` to the fields that can actually hold one:

```ts
addRules(fields, { city: { deriveOptions: () => regionsFor(fields) } })

form.options.city      // ok
form.selected.city     // ok
form.options.name      // ✗ this field is not a choice
```

The rule's key is `deriveOptions`, not `options`, because the shapes differ: an
array in the declaration, a function returning one in the rule. Sharing the name
would invite writing the array form in a rule and learning otherwise from a type
error.

Without it both would have to list every field, typing a plain text input as
though a choice might land in it.

### Multi-choice and nullable choices

An option holds what ONE choice is, not the whole field. A field storing an
array — a checkbox group, a multi-select — takes options of its entries, and
`selected` lists every chosen option in the list's order:

```ts
refFields({
  services: { label: 'Services', value: [] as string[], options: [{ label: 'Mail', value: 'mail' }] },
  state: { label: 'State', value: null as string | null, options: [{ label: 'SP', value: 'SP' }] },
})

form.selected.value.services   // FieldOption<string>[]
form.selected.value.state      // FieldOption<string> | undefined
```

`null` is how a field says nothing is chosen yet, never a choice, so it stays out
of the options: a select bound to `string | null` lists `string`s. The two
combine: a `string[] | null` field takes options of `string`, and its `selected`
is `undefined` while null and the chosen options once set.

`register()` hands a declared choice its `options` **always** — an empty list
included — because the component rendering a choice is a select that needs the
list before it arrives.

## The option's label

The field stores **only the value**. For the human-readable text, read it off
the field:

```ts
form.values.value.regiao        // 'first'
form.selected.value.regiao?.label // 'First Region'
```

Inside a setup you can read it off the field you declared —
`campos.regiao.selected` — since that's your own variable. From outside, go
through `selected`: reaching it was the only reason a consumer needed the raw
fields, and two ways to the same value is one too many.

Derived, never stored: change the list and the text follows instead of going
stale. Storing the `{ label, value }` object instead would break `v-model` by
identity, break `oneOf`, and send an object where the API expects a scalar.

## `payload`: what leaves for the backend

```ts
.payload(ctx => ({
  ...ctx.visible,
  region_label: ctx.fields.regiao.selected?.label ?? '',
  price: ctx.price.value,
}))
```

The payload is a **projection** of the form, not a set of fields. Without one it
is simply `values`.

It sits outside the setup on purpose: it becomes a pure function of what the
setup exposed, so it is testable without instantiating and cannot reach anything
the setup kept private. That also gives the setup's return a job — it is the
public surface.

**`values` or `visible`, your call.** `values` is every field; `visible` is only
what a rule is currently letting through. A backend that wants the key always
present spreads the first; one that must not receive the opposite group's
document spreads the second. Both reach the context because neither answer is
right for everyone.

## Catalog

```ts
const domain = useFormDomain('federal-court')  // typed to THAT domain
const catalog = useFormDomainsMetadata()       // no setup runs
const all = useFormDomains()                   // runs every setup
```

`useFormDomainsMetadata` instantiates **nothing** — `metadata` is static, so it
is read straight off the factory. That's the one for a listing: 300 certificates
cost 300 property reads, not 300 setups.

`x.ts` and `x/index.ts` are the same domain; if both exist, the directory wins.

## Two ways in, and which is for what

The engine and the field objects both reach the same state. They are not
redundant — they answer different questions, and mixing them up is the only
confusion here:

| you want | use |
|---|---|
| a collection, binding, validation | the engine: `values`, `register`, `canShow`, `selected`, `options` |
| one field, passed somewhere | `fields.cpf` |

```vue
<!-- the standard input contract: the engine builds the props -->
<MyInput v-bind="form.register('cpf')" />

<!-- your own contract: the component takes the field -->
<MyField :field="form.fields.cpf" />
```

A component that takes the field reads `label`, `value` and `selected` off it
and writes to `value`. `register()` doesn't replace that — it serves one
specific input shape.

Inside a setup, read the field off the const you declared. From outside, prefer
the engine, and reach for `fields` when you want the unit.

## Scaling up

Up to around eight fields, one file. Above that, split by **section** rather
than by layer — the unit you navigate is "the address block", not "all the
rules". `addRules` and `addSchemas` are callable as many times as you like, so
one file owns its block's rule *and* its validation:

```ts
// sections/documento.ts
export function documento(campos: Campos) {
  addRules(campos, { cpf: { canShow: () => isPF(campos), clearWhenHidden: true } })
  addSchemas(campos, { cpf: string().required() })
}
```

`fields` and anything derived stay central, because they are what the sections
share. What crosses a file boundary is `Campos = ReturnType<typeof createFields>`
— a type from your own factory, not from this package.

## Fields at module scope leak under SSR

Fields are reactive state, and declared at module scope they are built once per
process — so the second request drives the objects the first one filled in.

So when the fields live in their own file, export the **declaration** rather
than the built fields:

```ts
// fields.ts — plain data, safe at module scope
export const declaracao = {
  tipoPessoa: { label: 'Type', value: '' as Pessoa },
  cpf: { label: 'CPF', value: '', meta: { mask: 'cpf' } },
}

export type Campos = BuiltFields<typeof declaracao>

// index.ts — built inside the setup, once per request
const campos = refFields(declaracao)
```

What sits at module scope is an inert object. There is no reactive state, so
there is nothing to leak — the failure stops existing rather than being
detected. The guarantees stay in the constructor: `refFields` still rejects an
option whose value doesn't match its field's.

A factory (`const createFields = () => refFields({ ... })`) works too and was
the previous advice. The declaration is better because it removes the mistake
instead of wrapping it.

The types can't see any of this, so it is also caught at runtime: one fields
object driving two forms logs a warning naming the cause. A warning and not a
throw — by then the app is serving, and turning a data leak into a blank page
helps nobody.

## Composing fragments

A form assembled from parts composes the **declarations**, not the built fields:

```ts
// fragments/address.ts — plain data, safe at module scope
export const address = {
  cep: { label: 'CEP', value: '' },
  city: { label: 'City', value: '' },
}

// inside the setup
const fields = refFields(mergeFields([customer, address]))
```

`mergeFields` returns one flat declaration — the composition leaves no trace in
the type — and the fragments are still data afterwards, so the same two build
the next form without sharing anything with this one.

The order is the whole point. Merging before building is what gives every field
the whole tree: a rule declared next to `cep` can `ctx.patch({ name })` from the
other fragment, because both existed when the fields were built. Merging what
was already built would leave each field typed with the fragment it came from,
and would hand two forms the same reactive field — the leak above, arriving by a
route that a record-level guard cannot see.

Two fragments declaring the same key is not a merge, it is the later one
winning. That is a compile error, on the fragment doing the overriding:

```ts
mergeFields([
  { cpf: { label: 'CPF', value: '' } },
  { cpf: { label: 'Document', value: '' } },  // already declared by an earlier fragment: cpf
])
```

A fragment whose keys aren't known — one typed as the wide `FieldsInput` — is
refused too: the merged record would get an index signature, and from there
`register('anything')` compiles.

## What the compiler guarantees

| Error | When it surfaces |
|---|---|
| `addRules`/`addSchemas` naming a field that doesn't exist | **compile time** |
| `register()` on a field that doesn't exist | **compile time** |
| `register()` reading an extra the field never declared | **compile time** |
| an option whose value doesn't match the field's | **compile time** |
| two fragments declaring the same field | **compile time** |
| `deriveOptions` on a field that declared no options | **compile time** |
| reading `options`/`selected` on a field that isn't a choice | **compile time** |
| `useFormDomain('unknown-slug')` | **compile time** |
| the payload reading a key it doesn't project | **compile time** |
| `ctx.patch()` with a field that doesn't exist | ignored at runtime |
| fields shared across requests | runtime warning |

## API

```ts
refField({ label, value })        // one field, reusable across domains
refFields({ name: { ... } })      // the form's fields, named
mergeFields([a, b])               // declaration fragments into one

addRule(field, rule)           // behaviour for one field
addRules(fields, { ... })      // for several, keyed
addSchema(field, validator)    // validation for one
addSchemas(fields, { ... })    // for several

extendFormBindings(extender)   // extra keys on register(), from a plugin

toForm(fields)                       // assemble inside a component
defineFormDomain(id, meta?, setup)   // a shared domain
  .payload(ctx => ({ ... }))         // optional projection
```

```ts
const form = useFormDomain('federal-court')

form.id           // slug, as a literal type
form.fields       // the field objects: { label, value, key, selected }
form.values       // every value
form.visible      // only what a rule allows through
form.canShow      // { field: boolean }
form.selected     // the chosen option per field
form.options      // effective options per field
form.shape        // visible validators, with the types you declared
form.composeSchema(object)  // the same, composed by your library, reactive
form.validate()   // validates visible fields only
form.validateField(k)  // one field; hidden or unvalidated counts as valid
form.payload      // the projection, or `values` if none declared
form.register(k)  // ready-made input props, plus what extenders add
form.set(patch)   // partial, typed patch
form.reset()      // back to initial values
form.dispose()    // stops the effects
```

## Development

```bash
pnpm install
pnpm bootstrap   # generates the playground's .nuxt
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

### Layout

```
src/
  module.ts          the Nuxt module: the aliases, the auto-imports, the domain scan
  runtime/
    index.ts         the public surface, behind `#forms`
    types.ts         the shared vocabulary
    standard.ts      the Standard Schema adapter
    fields/          declaring:  refField, refFields, mergeFields, addRule, addSchema
    engine/          deriving:   values, options, validation, register(), the SSR guard
    domain/          the domain: defineFormDomain, the per-request registry, the catalog
```

One folder per layer, and the dependency runs one way: `domain` builds on
`engine`, `engine` builds on `fields`, and `types.ts` and `standard.ts` are the
vocabulary all three share.

The playground has `domain-guard` and `catalog-guard` pages whose type errors
are **expected**, asserted with `@ts-expect-error`. If a guarantee regresses the
directive goes unused and typecheck fails, instead of the breakage reaching a
project.

## License

MIT
