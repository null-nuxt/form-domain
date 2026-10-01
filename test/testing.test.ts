import { describe, expect, it } from 'vitest'
import { string } from 'yup'
import { refFields } from '../src/runtime/fields/declare'
import { addRules, addSchemas } from '../src/runtime/fields/register'
import { defineFormDomain } from '../src/runtime/domain/define'
import { useFormSession } from '../src/runtime/session/create'
import { getFormRegistry } from '../src/runtime/domain/registry'
import { createTestForm, forgetForm, resetForms, settle } from '../src/runtime/testing'

/**
 * The entry point a project tests its own domains through. What it is really
 * about is that a domain is a singleton: without this, the second test asking
 * for one gets what the first typed into it.
 */
describe('the testing entry point', () => {
  const definir = (id = 'testing-signup') => defineFormDomain(id, () => {
    const fields = refFields({
      email: { label: 'Email', value: '' },
      postcode: { label: 'Postcode', value: '' },
      city: { label: 'City', value: '' },
    })

    addSchemas(fields, { email: string().required('Email is required').email('Invalid email') })

    addRules(fields, {
      postcode: {
        onChange: async (postcode, { patch }) => {
          if (postcode.length !== 8) return
          await Promise.resolve()
          patch({ city: 'Recife' })
        },
      },
    })

    return { fields }
  })

  it('gives a form that starts from the declaration, whatever ran before', () => {
    const domain = definir()

    createTestForm(domain).set({ email: 'ana@example.com' })
    expect(createTestForm(domain).values.value.email).toBe('')

    resetForms()
  })

  /** Whatever is under test asks the domain, not the test, so it has to be the same one. */
  it('is the instance the domain hands out afterwards', () => {
    const domain = definir()
    const form = createTestForm(domain)

    expect(domain()).toBe(form)

    resetForms()
  })

  it('validates and projects without a component anywhere', async () => {
    const form = createTestForm(definir().payload(ctx => ({ login: ctx.visible.email })))

    expect((await form.validate()).firstErrors.email).toBe('Email is required')

    form.set({ email: 'ana@example.com' })
    expect((await form.validate()).valid).toBe(true)
    expect(form.payload.value).toEqual({ login: 'ana@example.com' })

    resetForms()
  })

  /** The question the report asked: nextTick, or something longer? */
  it('settle waits past a rule that went and asked something', async () => {
    const form = createTestForm(definir())

    form.set({ postcode: '50000000' })
    await settle()

    expect(form.values.value.city).toBe('Recife')

    resetForms()
  })

  it('forgetForm stops the effects it had', async () => {
    const domain = definir()
    const form = createTestForm(domain)

    forgetForm(domain.id)

    form.set({ postcode: '50000000' })
    await settle()

    // the lookup is gone with the instance, so nothing fills the city in
    expect(form.values.value.city).toBe('')
    expect(getFormRegistry().has(domain.id)).toBe(false)
  })

  /**
   * A session leaves when the last scope using it does, and a test has no scope
   * to unmount — so forgetting the form has to say it, or its watchers go on
   * re-deriving messages for a form nobody is looking at any more.
   */
  it('releases the session held for the form it forgets', async () => {
    const domain = definir()
    const form = createTestForm(domain)
    const session = useFormSession(form)

    await session.touch('email')
    session.setErrors({ email: 'already taken' })
    await settle()

    expect(form.fields.email.error).toBe('already taken')

    forgetForm(domain.id)
    form.set({ email: 'ana@example.com' })
    await settle()

    // alive, this message would have died with the value it spoke about
    expect(form.fields.email.error).toBe('already taken')

    resetForms()
  })

  it('resetForms clears every domain at once', () => {
    createTestForm(definir('testing-a'))
    createTestForm(definir('testing-b'))

    resetForms()

    expect(getFormRegistry().size).toBe(0)
  })
})
