<script setup lang="ts">
import { string } from 'yup'
import type { BuiltFields } from '#forms'

/**
 * The same block twice, with everything that comes with it.
 *
 * An address is not only fields: it knows how to look itself up from a postcode,
 * which of its fields something else decides, and what makes it valid. All of
 * that is written against the names IT declared — once — and `scopeOf` is what
 * puts it over a form that renamed them.
 */
const address = defineFields({
  zipCode: { label: 'Postcode*', value: '', placeholder: '00000-000' },
  street: { label: 'Street*', value: '' },
  city: { label: 'City*', value: '' },
})

const known: Record<string, { street: string, city: string }> = {
  '50000000': { street: 'Rua da Aurora', city: 'Recife' },
  '01310930': { street: 'Avenida Paulista', city: 'São Paulo' },
}

/** A fragment is a declaration, plus the rules that come with it. */
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

        // the street and the city are what have nothing to show while this runs
        busy('street', 'city')
        await new Promise(resolve => setTimeout(resolve, 400))
        patch(known[zipCode] ?? { street: '', city: '' })
      },
    },
    // filled in by the lookup, so nobody types in it — and it is still required
    city: { canEdit: () => false },
  })

  return { isResolved: () => fields.city.value !== '' }
}

const fields = refFields(mergeFields([
  { name: { label: 'Name*', value: '' } },
  address,
  prefixFields('company', address, { label: label => `Company ${label.toLowerCase()}` }),
]))

addSchemas(fields, { name: string().required('Name is required') })

/** One function, two blocks. Neither call knows the other exists. */
const home = addressRules(scopeOf(address, fields))
const company = addressRules(scopeOf(address, fields, 'company'))

const form = toForm(fields)
const { register, values } = form
const session = useFormSession(form)

const send = session.submit(payload => console.info('sent', payload))
</script>

<template>
  <main style="font-family: system-ui; padding: 2rem; display: grid; gap: 1rem; max-width: 34rem">
    <h1>Fragments</h1>
    <nav style="display:flex; gap:.75rem; font-size:.85rem">
      <NuxtLink to="/">
        index
      </NuxtLink>
      <NuxtLink to="/__forms">
        inspector
      </NuxtLink>
    </nav>

    <p style="color:#52525b; font-size:.9rem">
      Type <code>50000000</code> or <code>01310930</code> in either postcode. The
      lookup, the lock on the city and the three validators were written once,
      against the names the fragment declared.
    </p>

    <form
      style="display:grid; gap:.8rem"
      @submit="send"
    >
      <SimpleInput v-bind="register('name')" />

      <fieldset style="display:grid; gap:.6rem; border:1px solid #e4e4e7; border-radius:.4rem; padding:.8rem">
        <legend style="font-size:.8rem; color:#71717a">
          home · resolved: {{ home.isResolved() }}
        </legend>
        <SimpleInput v-bind="register('zipCode')" />
        <SimpleInput v-bind="register('street')" />
        <SimpleInput v-bind="register('city')" />
      </fieldset>

      <fieldset style="display:grid; gap:.6rem; border:1px solid #e4e4e7; border-radius:.4rem; padding:.8rem">
        <legend style="font-size:.8rem; color:#71717a">
          company · resolved: {{ company.isResolved() }}
        </legend>
        <SimpleInput v-bind="register('companyZipCode')" />
        <SimpleInput v-bind="register('companyStreet')" />
        <SimpleInput v-bind="register('companyCity')" />
      </fieldset>

      <button
        style="justify-self:start"
        :disabled="session.isSubmitting.value"
        type="submit"
      >
        send
      </button>
    </form>

    <pre style="background:#f4f4f5; padding:1rem; overflow:auto; font-size:.75rem">{{ values }}</pre>
  </main>
</template>
