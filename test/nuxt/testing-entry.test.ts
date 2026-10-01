import { afterEach, expect, it } from 'vitest'
import { addSchemas, defineFormDomain, refFields } from '#forms'
import { createTestForm, resetForms } from '../../src/runtime/testing'
import { string } from 'yup'

/**
 * The documented path, run the way a project runs it: the domain declared
 * through `#forms` and a real Nuxt app underneath — which is what makes this
 * worth a second project. Inside an app the registry lives on the app instance,
 * so a helper reaching for the module-level fallback instead would clear nothing
 * and this is the test that notices.
 *
 * The helper is imported from source rather than from
 * `@null-nuxt/form-domain/testing`, which is what a project writes: the built
 * package is whatever the last build left behind, and a test reading that would
 * pass against code nobody is editing. The export map is checked where the rest
 * of the packaging is.
 */
const useSignupForm = defineFormDomain('signup', () => {
  const fields = refFields({
    email: { label: 'Email', value: '' },
    nickname: { label: 'Nickname', value: '' },
  })

  addSchemas(fields, { email: string().required('Email is required') })

  return { fields }
}).payload(ctx => ({ login: ctx.visible.email }))

afterEach(resetForms)

it('builds a domain, validates it and projects its payload', async () => {
  const form = createTestForm(useSignupForm)

  expect((await form.validate()).firstErrors.email).toBe('Email is required')

  form.set({ email: 'ana@example.com' })

  expect((await form.validate()).valid).toBe(true)
  expect(form.payload.value).toEqual({ login: 'ana@example.com' })
})

/**
 * Asked of the domain itself, not of the helper: `createTestForm` forgets the
 * form on its own, so only a plain `useSignupForm()` can tell whether the
 * `afterEach` above cleared the registry this app is using.
 */
it('leaves nothing behind for whatever asks the domain next', () => {
  expect(useSignupForm().values.value.email).toBe('')
})
