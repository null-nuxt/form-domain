<script setup lang="ts">
/**
 * Every snippet in COOKBOOK.md, in one place, so the recipes are typechecked
 * rather than taken on trust. Not a page anyone is meant to open.
 */
import { string } from 'yup'
import type { BuiltFields } from '#forms'

const api = {
  address: async (_zipCode: string) => ({ street: 'Rua da Aurora', city: 'Recife' }),
  cities: async (_state: string) => [{ label: 'Recife', value: 'recife' }],
  post: async (_path: string, _body: unknown) => ({}),
  patch: async (_path: string, _body: unknown) => ({}),
}

/* --- A fragment that brings its own rules ------------------------------- */

const address = defineFields({
  zipCode: { label: 'Postcode*', value: '', placeholder: '00000-000' },
  street: { label: 'Street*', value: '' },
  city: { label: 'City*', value: '' },
})

const addressRules = (fields: BuiltFields<typeof address>) => {
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

  return { isResolved: () => fields.city.value !== '' }
}

const checkout = refFields(mergeFields([
  { name: { label: 'Name*', value: '' } },
  address,
  prefixFields('company', address, { label: label => `Company ${label.toLowerCase()}` }),
]))

const home = addressRules(scopeOf(address, checkout))
const company = addressRules(scopeOf(address, checkout, 'company'))
void home
void company

/* --- A block that only applies sometimes -------------------------------- */

const withBlock = refFields(mergeFields([
  { kind: { label: 'Kind', value: '' } },
  address,
]))

addGroupRule(withBlock, address, {
  canShow: () => withBlock.kind.value === 'company',
  clearWhenHidden: true,
})

addGroupRule(withBlock, ['street', 'city'], { canShow: () => true })

/* --- A list that depends on another field ------------------------------- */

const withList = refFields({
  state: { label: 'State', value: '' },
  city: { label: 'City', value: '', options: [] },
})

addRules(withList, {
  city: {
    loadOptions: async () => {
      const state = withList.state.value
      return state ? api.cities(state) : []
    },
  },
})

/* --- A field filled in by a lookup -------------------------------------- */

const withLookup = refFields({
  postcode: { label: 'Postcode', value: '' },
  street: { label: 'Street', value: '' },
  city: { label: 'City', value: '' },
})

addRules(withLookup, {
  postcode: {
    onChange: async (postcode, { patch, busy }) => {
      if (postcode.length !== 8) return patch({ street: '', city: '' })

      busy('street', 'city')
      patch(await api.address(postcode))
    },
  },
  city: { canEdit: () => false },
})

/* --- A wizard that validates one step at a time ------------------------- */

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
void send

/* --- A payload per step -------------------------------------------------- */

const useOnboarding = defineFormDomain('cookbook-onboarding', () => {
  const wizard = refSteps({
    who: {
      name: { label: 'Full name*', value: '' },
      email: { label: 'Email*', value: '' },
    },
    where: {
      postcode: { label: 'Postcode*', value: '' },
      city: { label: 'City*', value: '' },
    },
  })

  return { steps: wizard }
}).payload({
  who: ctx => ({ full_name: ctx.values.name, email: ctx.values.email }),
  done: ctx => ({ ...ctx.visible, source: 'wizard' }),
})

const onboarding = useOnboarding()
const wizardSession = useFormSession(onboarding)

const finish = wizardSession.submit({
  who: async ({ payload }) => api.post('/onboarding', payload),
  where: async ({ payload }) => api.patch('/address', payload),
  done: async payload => api.post('/onboarding/finish', payload),
})
void finish

/** The same body, for a page that wants to show what is about to be sent. */
void onboarding.stepPayloads.who.value.full_name
</script>

<template>
  <form @submit="send">
    <SimpleInput
      v-for="key in activeKeys"
      :key="key"
      v-bind="register(key)"
    />
    <button
      type="button"
      :disabled="isFirst"
      @click="back()"
    >
      back
    </button>
    <button type="submit">
      {{ isLast ? 'finish' : 'next' }}
    </button>
  </form>
</template>
