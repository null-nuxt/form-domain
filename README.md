# @null-nuxt/form-domain

A form declared as a **setup function** — fields, rules, validation and the
payload — consumed through composables, in the style of `defineStore`.

Schema-library agnostic: anything implementing
[Standard Schema](https://standardschema.dev) works — Zod, Valibot, ArkType,
yup 1.7+.

**Start** · [Installation](#installation) · [A form inside a component](#a-form-inside-a-component) · [A shared domain](#a-shared-domain)

**Why it looks like this** · [Why a setup and not a builder](#why-a-setup-and-not-a-builder) · [The names](#the-names-and-what-each-prefix-promises) · [Registration takes its target](#registration-takes-its-target)

**Declaring** · [Rules](#rules) · [Locked fields](#a-field-something-else-decides) · [Validation](#validation) · [`meta`](#meta-what-the-project-carries-on-a-field) · [Composing fragments](#composing-fragments) · [Module scope and SSR](#fields-at-module-scope-leak-under-ssr)

**Rendering** · [`register()`](#register-builds-the-input-props) · [Extending it](#extending-register) · [Choices](#only-declared-choices-are-choices) · [The option's label](#the-options-label)

**Sending** · [`payload`](#payload-what-leaves-for-the-backend) · [The attempt: `useFormSession`](#the-attempt-useformsession)

**Several screens** · [Multi-step forms](#multi-step-forms)

**Around the form** · [Seeing what a form is doing](#seeing-what-a-form-is-doing) · [Catalog](#catalog) · [Two ways in](#two-ways-in-and-which-is-for-what) · [Scaling up](#scaling-up)

**Reference** · [What the compiler guarantees](#what-the-compiler-guarantees) · [API](#api) · [Development](#development)

## Installation

```bash
pnpm add "github:null-nuxt/form-domain#v0.2.0"
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

const fields = refFields({
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

const isCompany = computed(() => fields.personType.value === 'company')

addRule(fields.ein, { canShow: () => isCompany.value, clearWhenHidden: true })

addSchemas(fields, {
  name: string().required(),
  personType: string().required(),
  ein: string().required(),
})

const { register, canShow, values, composeSchema } = toForm(fields)
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
  const fields = refFields(declaration)

  document(fields)   // one file per block
  region(fields)

  const isIndividual = computed(() => fields.personType.value === 'individual')

  return {
    fields,
    isIndividual,
    price: computed(() => isIndividual.value ? 59.9 : 89.9),
  }
})
  .payload(ctx => ({
    ...ctx.visible,
    region_label: ctx.fields.region.selected?.label ?? '',
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
addRule(fields.ein, { canShow: () => isCompany.value })
addRules(fields, { ein: { canShow: () => isCompany.value } })
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

### A field something else decides

`canShow` hides a field; `canEdit` locks one:

```ts
addRules(fields, {
  postcode: {
    onChange: async (postcode, ctx) => ctx.patch({ city: await lookup(postcode) }),
  },
  city: { canEdit: () => false },
})
```

The two answer different questions and get different answers. A hidden field
leaves validation with its rule; a **locked one stays in it**, because what it
holds usually still has to be right — a city filled in from a postcode is
exactly the kind of value a schema is about. Locking says who may write it, not
whether it counts.

`register()` sends `disabled: true` while the rule is holding it shut, and
nothing at all when it is not. The engine refuses the write as well, so a field
locked by a rule stays locked whether or not the component honoured the prop —
while `set()` and a rule's `patch()` still fill it, since that is the whole
point of locking it.

`form.canEdit` is the map, the sibling of `form.canShow`.

## Validation

One validator per field, not a composed schema:

```ts
addSchemas(fields, {
  name: string().required('Name is required'),
  // a getter when it depends on the form's state
  region: () => string().oneOf(validValues(fields)).required(),
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

### Submitting is not the form's job

There is no `onSubmit` on the form, and there won't be. What was tried, what
came back and what is worth showing about it cannot be derived from the fields,
and keeping it in the engine would turn `validate()` from a question you ask
into a state you maintain.

It lives one layer up, in [`useFormSession`](#the-attempt-useformsession), which
is optional. A project already using vee-validate or FormKit ignores it and
keeps `shape` and `validate`.

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
  extendFormBindings(field => ({
    mask: field.meta?.mask,
    errorMessage: field.error,
  }))
})

declare module '#forms' {
  interface CustomFieldBindings {
    mask?: string
    errorMessage?: string
  }
}
```

That augmentation needs no import from `#forms`. It normally would — an
augmentation only resolves if something in the program has referenced the module
— but a project living on auto-imports references it nowhere, and TypeScript
reports that as `module '#forms' cannot be found` **on the augmentation**, which
is not where the problem is. The module generates the reference instead.

A key whose value is `undefined` is left out: the extender had nothing to add
for that field, which is what lets it be written as the plain object it is
rather than a spread of conditionals. It does not mean "remove" — a default the
engine already put there stays.

The augmentation is the other half, and it is not generic over the form and the
key. It was, so that an added key could depend on the field it was for; but
TypeScript requires an augmentation to repeat a type parameter list exactly, so
every project paid for two generics, an import and a lint exception to type keys
that in practice are flat.

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
form.values.value.region        // 'first'
form.selected.value.region?.label // 'First Region'
```

Inside a setup you can read it off the field you declared —
`fields.region.selected` — since that's your own variable. From outside, go
through `selected`: reaching it was the only reason a consumer needed the raw
fields, and two ways to the same value is one too many.

Derived, never stored: change the list and the text follows instead of going
stale. Storing the `{ label, value }` object instead would break `v-model` by
identity, break `oneOf`, and send an object where the API expects a scalar.

## `payload`: what leaves for the backend

```ts
.payload(ctx => ({
  ...ctx.visible,
  region_label: ctx.fields.region.selected?.label ?? '',
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

## The attempt: `useFormSession`

The form answers what is true of the fields right now. What was *tried* — the
submit that failed, the message the server sent back, whether a field has been
visited — is not among those answers, so it lives one layer up, and using it is
a choice:

```ts
const form = useFormDomain('signup')
const session = useFormSession(form)

const send = session.submit(async (payload) => {
  const { error } = await api.post('/signup', payload)
  if (error) session.setErrors({ email: 'already taken' })
})
```

`submit` validates first and calls the handler only if it passed, hands it the
`payload` — the domain's projection, or `values` for a plain form — and ignores
a second call while the first is in flight, because a double click is one click.

### Who owns the error

The form is the truth; the session is the memory. `validate()` can be asked at
any moment and keeps nothing, and the session stores the last answer plus the
policy for when it has earned the right to be shown:

- **Nothing shows while the form is only being filled.** A message appears once
  sending was attempted, or once that field was visited — `touch(key)`, usually
  on blur.
- **After that, the field answers again on every change** — and so does every
  other field that has been asked about. A validator can be about more than its
  own field (a confirmation that has to match, a date that has to come after
  another), so fixing the password is what clears the message on the
  confirmation. The field being typed in answers immediately; the others wait
  for the typing to pause.
- **A server's message lives until the value it spoke about changes.** Nothing
  local can recompute "already taken": surviving everything leaves the field red
  after the fix, and dying on the next keystroke means nobody reads it.
- **A hidden field has no message.** What isn't validated cannot be wrong, so a
  skipped step takes its messages with it.

If the two ever disagree, the form is right and the session has not re-run.

### One `register()`, not two

The session writes the message onto the field, as `field.error`. It does not
wrap `register()`, and there is no `session.register`: one door means there is
never a question of which one to use.

Nothing reaches a component on its own. The project maps it with
`extendFormBindings` — the same mechanism as `meta.mask` — under whatever name
its own input declares:

```ts
extendFormBindings(field => field.error ? { errorMessage: field.error } : undefined)
```

An input that declares nothing receives nothing, so a plain `<input>` collects
no stray attribute. Blur is wired the same way, in the open, where the input is:

```vue
<MyInput v-bind="register(key)" @blur="session.touch(key)" />
```

### With a wizard

A form that exposes `steps` gives its session a `next()`: it validates the
active step, remembers what was refused, advances if it passed, and answers
whether it moved. A wizard built inside a component hands both over together:

```ts
const session = useFormSession({ ...form, steps })
```

`next` also takes the handler for whatever has to succeed before leaving —
saving the step, most of the time:

```ts
const advance = () => session.next(async ({ step, values }) => {
  const { error } = await api.post(`/onboarding/${step}`, values)

  if (error) {
    session.setErrors({ email: 'already registered' })
    return false
  }
})
```

It runs only after the step validated and receives that step's values, with
`step` narrowed so a `switch` on it is typed. Returning `false` keeps the wizard
where it is, having said why through `setErrors`; throwing keeps it there too,
and the throw is yours — a network that fell over is not a form outcome.
`isSubmitting` covers the wait, so the button disables itself and a second click
is the same click.

## Seeing what a form is doing

In dev the module adds a **Forms** tab to Nuxt DevTools, and the same page at
`/__forms` if you would rather have it full screen. Either one shows every
domain built in the app, and for each one what its fields hold, which rule is
attached, whether the field is being validated right now, what its options and
`meta` are, and whatever a session is showing for it.

```
field         value   shown  validated  rule                      options  meta            error
personType    "PF"    yes    yes        onChange                  —        —               —
cpf           ""      yes    yes        canShow, clearWhenHidden  —        {"mask":"cpf"}  —
cnpj          ""      no     no         canShow, clearWhenHidden  —        {"mask":"cnpj"} —
region        ""      yes    yes        canShow, deriveOptions    2        —               —
```

It reads and writes nothing, and it shows **domains**: a form built inside a
component with `toForm` has no id and is in no registry, so it does not appear.

The tab is an iframe with a JavaScript realm of its own, so it cannot share the
app's reactivity — it reads the app underneath through the devtools client and
polls a snapshot four times a second. The same page opened as a route reads the
app it is in, and polls all the same, because one path that always works beats
two that differ by where you opened it.

Opened as a route it shows the forms built in that page load, so reach it by
clicking through the app rather than by typing the URL: a full reload starts a
new app, and the registry is per request by design. In the DevTools drawer this
does not come up, since the app underneath is never reloaded.

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
// sections/document.ts
export function document(fields: Fields) {
  addRules(fields, { cpf: { canShow: () => isIndividual(fields), clearWhenHidden: true } })
  addSchemas(fields, { cpf: string().required() })
}
```

`fields` and anything derived stay central, because they are what the sections
share. What crosses a file boundary is `Fields = BuiltFields<typeof declaration>`
— a type read off your own declaration, not one this package hands you.

## Fields at module scope leak under SSR

Fields are reactive state, and declared at module scope they are built once per
process — so the second request drives the objects the first one filled in.

So when the fields live in their own file, export the **declaration** rather
than the built fields:

```ts
// fields.ts — plain data, safe at module scope
export const declaration = {
  personType: { label: 'Type', value: '' as PersonType },
  cpf: { label: 'CPF', value: '', meta: { mask: 'cpf' } },
}

export type Fields = BuiltFields<typeof declaration>

// index.ts — built inside the setup, once per request
const fields = refFields(declaration)
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
export const address = defineFields({
  cep: { label: 'CEP', value: '' },
  city: { label: 'City', value: '' },
})

// inside the setup
const fields = refFields(mergeFields([customer, address]))
```

`defineFields` builds nothing — it returns what it was given. It is there for
what happens while you type: the editor completes the declaration, and an option
whose value doesn't match its field fails in the file that declared it instead
of wherever the fragment is later picked up. A bare object literal still works.

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

## Multi-step forms

A wizard is one form shown in parts, not several forms. `refSteps` takes the
steps keyed by name, merges their declarations into a single tree, and returns
the machine that walks it:

```ts
const steps = refSteps({
  who: { name: { label: 'Name', value: '' } },
  where: { city: { label: 'City', value: '' } },
})

addSchemas(steps.fields, { name: string().required(), city: string().required() })

const { register } = toForm(steps.fields)
const { names, current, activeKeys, isFirst, isLast, back, next } = steps
```

Keyed, like everything else here — `refFields({ key })`, `addRules(fields, { key })`.
The name belongs to the wizard rather than to the fragment: the same address
declaration is `where` in this form and `delivery` in the next one, and a step
reused in two places doesn't drag a name along. TypeScript also refuses the same
key twice in a literal, so two steps cannot share a name by accident.

`next()` validates the active step's keys — through the same `shape` the submit
reads — and advances only if they pass. It also takes a gate: anything else that
has to succeed first, which returning `false` refuses.

```ts
await steps.next(async () => confirm('Send this step?'))
```

A session fills that gate in for you — see [the attempt](#with-a-wizard). The result comes back either way:
what to show for a field that failed is the page's question, not the machine's.
`back()` is free, and `goTo(name)` moves backwards only, so no step is skipped
without having been asked whether it is valid.

One tree is the whole point. Every step's fields land in the same record, so a
rule in the last step reads a value from the first, `values` is complete at any
moment, and the payload stays one projection instead of a join. What a step
decides is which keys are shown together — that is `activeKeys`, typed, so the
page renders the current step with a `v-for`:

```vue
<SimpleInput
  v-for="key in activeKeys"
  :key="key"
  v-bind="register(key)"
/>
```

### A step that only applies sometimes

`addStepRules` attaches to steps what `addRules` attaches to fields, keyed the
same way:

```ts
addStepRules(steps, {
  company: { canShow: () => steps.fields.kind.value === 'PJ' },
})
```

A step that doesn't apply is walked past: `next()` and `back()` go around it,
`visibleNames` leaves it out, and `goTo` refuses it. And its fields go with it —
they stop being shown, stop being validated, and stop being required on submit.

That last part is the whole reason it is a step rule and not a flag in the page.
A step skipped while its fields stayed in the schema is a form that cannot be
sent and cannot say which field is missing.

It works while the form is being filled, in both directions: change the answer
that hid a step and it comes back into the walk, and if the step being looked at
is the one that goes away, the wizard moves to the next one still standing.

### When the step changes

Moving belongs to the wizard; what moving *causes* belongs to the page.
`current` is a computed, so a watcher is the whole mechanism:

```ts
watch(current, (name) => {
  history.replaceState(history.state, '', `#${name}`)
  window.scrollTo({ top: 0 })
})
```

There is no `onEnter` or `onLeave`. It would be a second way to say what a
watcher already says, and scrolling or writing to the URL is not something a
form domain should own.

The way back in is `resume`:

```ts
const fromHash = route.hash.slice(1)
if (steps.isStepName(fromHash)) await steps.resume(fromHash)
```

`resume` is `next()` repeated rather than a jump: it starts at the first step
and stops at the one the data doesn't support. A wizard reopened with nothing
filled lands on step one instead of in the middle of a form it never saw, and a
draft restored beforehand walks all the way back to where it left off. It
answers with the name it stopped at.

`isStepName` exists because a hash — or a saved draft, or a query string — is a
string from outside the types. Checking it once, in the open, beats casting at
the call.

### Adding a step later

Declare it and gate it. There is no `steps.add(...)`: the tree is built once,
and that is what makes `values`, the payload and every key `register()` accepts
typed — a step appearing at runtime would widen all of them to "whatever turns
up".

A step that exists only for some answers is declared like any other and given a
`canShow`. A step that comes from data — one block per address the user adds —
is a different feature: repetition rather than condition, and this module does
not have it yet.

A field key declared by two steps means one of them is ignored, since the tree
is built once — that is a compile error naming the key, on both steps, because
a record has no order for the types to blame the later one with. A step named
with a number is refused too: the runtime orders integer-like keys ahead of the
rest, so the wizard would walk in an order nobody wrote.

## What the compiler guarantees

| Error | When it surfaces |
|---|---|
| `addRules`/`addSchemas` naming a field that doesn't exist | **compile time** |
| `register()` on a field that doesn't exist | **compile time** |
| `register()` reading an extra the field never declared | **compile time** |
| an option whose value doesn't match the field's | **compile time** |
| two fragments declaring the same field | **compile time** |
| two steps declaring the same field | **compile time** |
| `addStepRules` naming a step that doesn't exist | **compile time** |
| `setErrors` naming a field that doesn't exist | **compile time** |
| `goTo()` naming a step that doesn't exist | **compile time** |
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
defineFields({ name: { ... } })   // a declaration in its own file, checked there
refSteps({ who: { ... } })        // one tree out of the steps, plus where in it we are
addStepRules(steps, { who: {...} })  // when a step applies at all
useFormSession(form)              // the attempt: submit, messages, touched

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
project. What the types cannot see is asserted in `test/`, one file per layer —
`fields`, `engine`, `validation`, `bindings`, `domain`, `steps`, `session`,
`module` — with the shared fixture in `test/support`.

## License

MIT
