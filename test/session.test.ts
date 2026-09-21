import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { string } from 'yup'
import { addRules, addSchemas } from '../src/runtime/fields/register'
import { refFields } from '../src/runtime/fields/declare'
import { defineFormDomain, toForm } from '../src/runtime/domain/define'
import { getFormRegistry } from '../src/runtime/domain/registry'
import { refSteps } from '../src/runtime/steps/create'
import { useFormSession } from '../src/runtime/session/create'
import type { PersonType } from './support/fields'

describe('useFormSession', () => {
  /** Validation is asynchronous, so a tick alone doesn't see the answer. */
  const settle = () => new Promise(resolve => setTimeout(resolve, 0))

  const buildForm = () => {
    const fields = refFields({
      name: { label: 'Name', value: '' },
      email: { label: 'Email', value: '' },
    })

    addSchemas(fields, {
      name: string().required('Name is required'),
      email: string().required('Email is required'),
    })

    return toForm(fields)
  }

  it('shows nothing while the form is only being filled', async () => {
    const form = buildForm()
    const session = useFormSession(form)
    await nextTick()

    expect(session.errors.value).toEqual({})
    expect(form.fields.name.error).toBeUndefined()
  })

  /** The field is where the message lands, so there is one `register()`. */
  it('remembers what a refused submit said, on the field', async () => {
    const form = buildForm()
    const session = useFormSession(form)
    const handler = vi.fn()

    await session.submit(handler)()
    await nextTick()

    expect(handler).not.toHaveBeenCalled()
    expect(session.errorOf('name')).toBe('Name is required')
    expect(form.fields.name.error).toBe('Name is required')
  })

  it('hands the handler the values once it passes', async () => {
    const form = buildForm()
    const session = useFormSession(form)
    const handler = vi.fn()

    form.set({ name: 'Ana', email: 'ana@example.com' })
    await session.submit(handler)()

    expect(handler).toHaveBeenCalledWith({ name: 'Ana', email: 'ana@example.com' })
    expect(session.errors.value).toEqual({})
  })

  /** Someone fixing a mistake watches it go, without waiting for another submit. */
  it('a field asked about once answers again on every change', async () => {
    const form = buildForm()
    const session = useFormSession(form)

    await session.submit(vi.fn())()
    expect(session.errorOf('name')).toBe('Name is required')

    form.set({ name: 'Ana' })
    await settle()

    expect(session.errorOf('name')).toBeUndefined()
    expect(form.fields.name.error).toBeUndefined()
  })

  it('touch asks about one field and shows only that one', async () => {
    const form = buildForm()
    const session = useFormSession(form)

    await session.touch('name')
    await nextTick()

    expect(session.errorOf('name')).toBe('Name is required')
    expect(session.errorOf('email')).toBeUndefined()
  })

  /**
   * A server's message cannot be recomputed, so the only honest way to expire
   * it is the value it spoke about changing.
   */
  it("a server's message lives until its value changes", async () => {
    const form = buildForm()
    const session = useFormSession(form)

    form.set({ name: 'Ana', email: 'ana@example.com' })
    await session.submit(vi.fn())()

    session.setErrors({ email: 'already taken' })
    await nextTick()
    expect(session.errorOf('email')).toBe('already taken')

    form.set({ email: 'other@example.com' })
    await settle()

    expect(session.errorOf('email')).toBeUndefined()
  })

  it('a second submit while the first is in flight is the same submit', async () => {
    const form = buildForm()
    const session = useFormSession(form)
    form.set({ name: 'Ana', email: 'ana@example.com' })

    let release = () => {}
    const handler = vi.fn(() => new Promise<void>((resolve) => {
      release = resolve
    }))

    const send = session.submit(handler)
    const first = send()
    await settle()

    expect(session.isSubmitting.value).toBe(true)
    expect(handler).toHaveBeenCalledOnce()

    await send()
    expect(handler).toHaveBeenCalledOnce()

    release()
    await first

    expect(session.isSubmitting.value).toBe(false)
  })

  /** A wizard's step is an attempt too, so `next` feeds the same memory. */
  it('next shows what the step refused, and moves on when it passes', async () => {
    const domain = defineFormDomain('session-wizard', () => {
      const steps = refSteps({
        who: { name: { label: 'Name', value: '' } },
        where: { city: { label: 'City', value: '' } },
      })

      addSchemas(steps.fields, {
        name: string().required('Name is required'),
        city: string().required('City is required'),
      })

      return { fields: steps.fields, steps }
    })

    const form = domain()
    const session = useFormSession(form)

    expect(await session.next()).toBe(false)
    await nextTick()
    expect(session.errorOf('name')).toBe('Name is required')
    expect(form.steps.current.value).toBe('who')

    form.set({ name: 'Ana' })
    await settle()

    expect(await session.next()).toBe(true)
    expect(form.steps.current.value).toBe('where')

    getFormRegistry().delete('session-wizard')
  })

  /** What isn't validated cannot be wrong: a hidden field has nothing to show. */
  it('drops the message of a field a rule hides', async () => {
    const fields = refFields({
      personType: { label: 'Type', value: '' as PersonType },
      cpf: { label: 'CPF', value: '' },
    })
    addRules(fields, { cpf: { canShow: () => fields.personType.value === 'PF' } })
    addSchemas(fields, { cpf: string().required('CPF is required') })

    const form = toForm(fields)
    const session = useFormSession(form)

    form.set({ personType: 'PF' })
    await nextTick()
    await session.submit(vi.fn())()
    expect(session.errorOf('cpf')).toBe('CPF is required')

    form.set({ personType: 'PJ' })
    await settle()

    expect(session.errorOf('cpf')).toBeUndefined()
  })
})
