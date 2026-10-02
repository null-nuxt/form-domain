# Cookbook

Six patterns, because these are the six that a real form turned out to need. The
[README](./README.md) says why each one is shaped the way it is; this is the shape
itself, ready to copy.

Every recipe here is taken from the playground or the test suite and typechecked
as a whole; the only thing standing in for your own project is `api`.

- [A fragment that brings its own rules](#a-fragment-that-brings-its-own-rules)
- [A block that only applies sometimes](#a-block-that-only-applies-sometimes)
- [A list that depends on another field](#a-list-that-depends-on-another-field)
- [A field filled in by a lookup](#a-field-filled-in-by-a-lookup)
- [A wizard that validates one step at a time](#a-wizard-that-validates-one-step-at-a-time)
- [A payload per step](#a-payload-per-step)

## A fragment that brings its own rules

An address is not only fields: it knows how to look itself up, which of its fields
something else decides, and what makes it valid. Declare that once, next to the
fragment, and let the form say where it goes.

```ts
// forms/fragments/address.ts — plain data, safe at module scope
import { string } from 'yup'
import type { BuiltFields } from '#forms'

export const address = defineFields({
  zipCode: { label: 'Postcode*', value: '', placeholder: '00000-000' },
  street: { label: 'Street*', value: '' },
  city: { label: 'City*', value: '' },
})

/** A fragment is a declaration, plus the rules that come with it. */
export const addressRules = (fields: BuiltFields<typeof address>) => {
  addSchemas(fields, {
    zipCode: string().required('Postcode is required').length(8, 'Eight digits'),
    street: string().required('Street is required'),
    city: string().required('City is required'),
  })

  addRules(fields, {
    zipCode: {
      onChange: async (zipCode, { patch, busy }) => {
        if (zipCode.length !== 8) return patch({ street: '', city: '' })

        busy('street', 'city')
        patch(await api.address(zipCode))
      },
    },
    city: { canEdit: () => false },
  })

  // what the screen needs out of it, and nothing it doesn't
  return { isResolved: () => fields.city.value !== '' }
}
```

```ts
// forms/checkout.ts
const fields = refFields(mergeFields([
  { name: { label: 'Name*', value: '' } },
  address,
  prefixFields('company', address, { label: label => `Company ${label.toLowerCase()}` }),
]))

const home = addressRules(scopeOf(address, fields))
const company = addressRules(scopeOf(address, fields, 'company'))
```

`scopeOf` hands the rules the form's **own** fields under the names the fragment
declared, so one function serves both blocks and neither call knows the other
exists.

**What goes wrong:** attaching the rules after the form is built. `onChange` and
`loadOptions` are watchers the engine creates when it is built, so attach before
`toForm()` — or, in a domain, before the setup returns. It says so if you don't.

## A block that only applies sometimes

One rule for the whole section, not one per field. The fields go, and they go out
of validation with it — no `.when()` anywhere.

```ts
addGroupRule(fields, address, {
  canShow: () => fields.kind.value === 'company',
  clearWhenHidden: true,
})
```

The target is the fragment that declares the fields, so a field added to it joins
the group without anyone remembering to say so. A list of keys works too:
`addGroupRule(fields, ['street', 'city'], { canShow })`.

A field answers to its own rule **and** to every group it is in, so a block inside
a wizard step inside a section needs nothing written twice.

**What goes wrong:** `clearWhenHidden` on a field that two groups can hide. It is
read off whatever is hiding the field, so a lookup that folds the block away
without asking to clear keeps what the person typed, while the toggle that drops
the block takes its values with it. Put the flag next to the `canShow` that means
it.

## A list that depends on another field

`loadOptions` re-runs on whatever it read **before its first `await`**. There is no
dependency to declare and no watcher to wire.

```ts
addRules(fields, {
  city: {
    loadOptions: async () => {
      const state = fields.state.value    // read before the await: this is the dependency
      return state ? api.cities(state) : []
    },
  },
})
```

A slower answer to an older question loses to a newer one, a failed load leaves
the list it had, and a successful one drops a value the new list no longer offers —
back to what the field was declared with. While it is in flight the field says so
through `busy`.

For a list that is computed rather than fetched, `deriveOptions` is the same idea
without the promise. Only a field that declared `options` gets either; that is what
makes it a choice.

**What goes wrong:** reading the dependency after the `await`. Then nothing
re-runs it, and the list is whatever the first call returned.

## A field filled in by a lookup

```ts
addRules(fields, {
  postcode: {
    onChange: async (postcode, { patch, busy }) => {
      if (postcode.length !== 8) return patch({ street: '', city: '' })

      // the street and the city are the inputs with nothing to show
      busy('street', 'city')
      patch(await api.address(postcode))
    },
  },
  city: { canEdit: () => false },
})
```

`patch` is a **request**: a slow answer to an old postcode is dropped, so an
autofill never overwrites what the person typed in the meantime. `canEdit` locks
the filled-in field without hiding it — it is still validated, because what it
holds still has to be right.

`busy` holds those fields for as long as the handler runs, a throw included. The
input reads one boolean, `field.busy`, which a project maps onto its own prop:

```ts
extendFormBindings(field => ({ loading: field.busy }))
```

**What goes wrong:** showing the spinner on the postcode. The field being typed in
is not the field that is waiting.

## A wizard that validates one step at a time

```ts
const steps = refSteps({
  who: {
    name: { label: 'Full name*', value: '' },
    email: { label: 'Email*', value: '' },
  },
  where: {
    postcode: { label: 'Postcode*', value: '' },
    city: { label: 'City*', value: '' },
  },
})

addStepRules(steps, {
  where: { canShow: () => steps.fields.email.value !== '' },
})

const form = toForm(steps.fields)
const session = useFormSession({ ...form, steps })

/** Destructured because the template unwraps a ref it holds, not one behind an object. */
const { register } = form
const { activeKeys, isFirst, isLast, back } = steps

const send = session.submit({
  who: async ({ payload }) => api.post('/onboarding', payload),
  done: async payload => api.post('/onboarding/finish', payload),
})
```

```vue
<form @submit="send">
  <SimpleInput
    v-for="key in activeKeys"
    :key="key"
    v-bind="register(key)"
  />
  <button type="button" :disabled="isFirst" @click="back()">back</button>
  <button type="submit">{{ isLast ? 'finish' : 'next' }}</button>
</form>
```

One `<form>`, one submit, and the page never asks whose turn it is: on any step but
the last it validates that step, hands its handler the body and moves on; on the
last it validates everything and hands `done` the payload. A step with no handler
is walked past. A step that does not apply takes its fields out of validation with
it.

One tree, so a rule in the last step reads a value from the first and `values` is
complete at any moment. What a step decides is which keys are shown together, which
is `activeKeys`.

`steps` is a plain object holding refs, so the template reads them destructured —
`activeKeys`, not `steps.activeKeys`, which arrives as the ref itself.

**What goes wrong:** moving the wizard from a handler. Return `false` to refuse —
after calling `session.setErrors({ email: 'already taken' })` to say why — and let
the session do the moving.

## A payload per step

A wizard that saves each step sends a body per step, and what that body is belongs
with the form, not with the page:

```ts
export const useOnboarding = defineFormDomain('onboarding', () => {
  const steps = refSteps({ /* … */ })

  return { steps }
}).payload({
  who: ctx => ({ full_name: ctx.values.name, email: ctx.values.email }),
  done: ctx => ({ ...ctx.visible, source: 'wizard' }),
})
```

Each projection reads the same context the whole form's does, with `values`
narrowed to the keys that step declared. A step that declares none sends what it
holds. `done` is the whole form, and it is a reserved step name.

The submit handler is then given the projected body:

```ts
const send = session.submit({
  who: async ({ payload }) => api.post('/onboarding', payload),   // { full_name, email }
  where: async ({ payload }) => api.patch('/address', payload),   // its own values
  done: async payload => api.post('/onboarding/finish', payload),
})
```

`values` is still there for a handler that wants the raw fields, and
`form.stepPayloads.who` is the same body if a page wants to show what is about to
be sent.

**What goes wrong:** nothing changes for a form without steps. `.payload(ctx => …)`
is the same single projection it always was.
