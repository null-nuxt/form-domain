<script setup lang="ts">
import { computed, ref } from 'vue'
import { string } from 'yup'

/**
 * A simple form declared inside the component. No wrapper needed: `<script
 * setup>` is already the scope, so the fields are consts, anything derived is a
 * `computed`, and the form is assembled at the end.
 */
const fields = refFields({
  name: { label: 'Full name*', value: '', placeholder: 'Your full name' },
  email: { label: 'Email*', value: '', placeholder: 'you@example.com' },
  type: {
    label: 'Profile*',
    value: '' as 'PF' | 'PJ' | '',
    options: [
      { label: 'Individual', value: 'PF' },
      { label: 'Company', value: 'PJ' },
    ],
  },
  state: {
    label: 'State*',
    value: '',
    options: [
      { label: 'Pernambuco', value: 'PE' },
      { label: 'São Paulo', value: 'SP' },
    ],
  },
  city: { label: 'City*', value: '', options: [] },
  cpf: { label: 'CPF*', value: '', meta: { mask: 'cpf' } },
  cnpj: { label: 'CNPJ*', value: '', meta: { mask: 'cnpj' } },
})

const isIndividual = computed(() => fields.type.value === 'PF')

/** A list that has to be fetched: no dependency declared, just read before the await. */
const cities: Record<string, Array<{ label: string, value: string }>> = {
  PE: [{ label: 'Recife', value: 'recife' }, { label: 'Olinda', value: 'olinda' }],
  SP: [{ label: 'Santos', value: 'santos' }, { label: 'Campinas', value: 'campinas' }],
}

addRules(fields, {
  city: {
    loadOptions: async () => {
      const state = fields.state.value
      if (!state) return []

      await new Promise(resolve => setTimeout(resolve, 400))
      return cities[state] ?? []
    },
  },
  cpf: { canShow: () => isIndividual.value, clearWhenHidden: true },
  cnpj: { canShow: () => fields.type.value === 'PJ', clearWhenHidden: true },
})

addSchemas(fields, {
  name: string().required('Name is required').min(3, 'Name is too short'),
  email: string().required('Email is required').email('Invalid email'),
  type: string().required('Profile is required'),
  state: string().required('State is required'),
  city: string().required('City is required'),
  cpf: string().required('CPF is required'),
  cnpj: string().required('CNPJ is required'),
})

/**
 * Destructuring is the recommended usage: `canShow` and `values` come back as
 * refs and the template unwraps them. Keeping the whole object would force
 * `form.canShow.value.cpf` even inside a `v-if`.
 */
const { register, canShow, values, validate } = toForm(fields)

/**
 * Submitting belongs to the project's form library (vee-validate, FormKit...),
 * not to this module: it hands over schema and state, you run the validation.
 */
const errors = ref<string[]>([])
const submit = async () => {
  const result = await validate()
  errors.value = Object.values(result.errors).flat()
}
</script>

<template>
  <main style="font-family: system-ui; padding: 2rem; display: grid; gap: 1rem; max-width: 40rem">
    <h1>Simple form</h1>
    <p style="color:#52525b; font-size:.9rem">
      Declared inline in the component, with no file under <code>forms/</code>.
    </p>

    <form
      style="display:grid; gap:.8rem"
      @submit.prevent="submit"
    >
      <!-- register() hands over name, label, placeholder and the v-model binding -->
      <SimpleInput v-bind="register('name')" />
      <SimpleInput v-bind="register('email')" />
      <SimpleSelect v-bind="register('type')" />
      <SimpleSelect v-bind="register('state')" />
      <SimpleSelect v-bind="register('city')" />

      <SimpleInput
        v-if="canShow.cpf"
        v-bind="register('cpf')"
      />
      <SimpleInput
        v-if="canShow.cnpj"
        v-bind="register('cnpj')"
      />

      <button
        type="submit"
        style="justify-self:start; padding:.5rem 1rem"
      >
        validate
      </button>
    </form>

    <ul
      v-if="errors.length"
      style="color:#b91c1c; font-size:.85rem"
    >
      <li
        v-for="error in errors"
        :key="error"
      >
        {{ error }}
      </li>
    </ul>

    <pre style="background:#f4f4f5; padding:1rem; font-size:.75rem; overflow:auto">{{ values }}</pre>
  </main>
</template>
