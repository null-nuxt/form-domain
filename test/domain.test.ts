import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { addRule } from '../src/runtime/fields/register'
import { refFields } from '../src/runtime/fields/declare'
import { defineFormDomain, toForm } from '../src/runtime/domain/define'
import { getFormRegistry } from '../src/runtime/domain/registry'
import { buildFields } from './support/fields'

describe('a shared domain', () => {
  const definir = (id: string) => defineFormDomain(id, { title: 'Certidão', order: 10 }, () => {
    const f = buildFields()
    return { fields: f, isPF: { value: f.personType.value === 'PF' } }
  })

  it('reads metadata off the factory without instantiating', () => {
    const domain = definir('setup-metadata')

    expect(domain.metadata.title).toBe('Certidão')
    expect(getFormRegistry().has('setup-metadata')).toBe(false)

    domain()
    expect(getFormRegistry().has('setup-metadata')).toBe(true)
  })

  it('shares the instance, like defineStore', () => {
    const domain = definir('setup-shared')
    expect(domain()).toBe(domain())
  })

  it('exposes what the setup returned beyond the fields', () => {
    const domain = definir('setup-exposed')
    expect(domain().isPF).toEqual({ value: false })
  })

  it('with no projection, the payload is values', () => {
    const domain = defineFormDomain('setup-no-payload', () => ({
      fields: refFields({ name: { label: 'Name', value: 'Ana' } }),
    }))

    expect(domain().payload.value).toEqual({ name: 'Ana' })
  })

  it('the projection receives visible and what the setup exposed', async () => {
    const domain = defineFormDomain('setup-payload', () => {
      const f = buildFields()
      return { fields: f, price: { value: 59.9 } }
    }).payload(ctx => ({
      ...ctx.visible,
      region_label: ctx.fields.region.selected?.label ?? '',
      price: ctx.price.value,
    }))

    const form = domain()
    form.set({ personType: 'PF', region: 'first' })
    await nextTick()

    expect(form.payload.value).not.toHaveProperty('cnpj')
    expect(form.payload.value.region_label).toBe('1st Region')
    expect(form.payload.value.price).toBe(59.9)
  })

  it('metadata is optional', () => {
    const domain = defineFormDomain('setup-no-metadata', () => ({
      fields: refFields({ name: { label: 'Name', value: '' } }),
    }))

    expect(domain.metadata).toEqual({})
    expect(domain().values.value.name).toBe('')
  })
})

describe('instance and effects', () => {
  it('reset goes back to the initial values', async () => {
    const form = toForm(buildFields())

    form.set({ personType: 'PF', cpf: '111' })
    await nextTick()
    form.reset()

    expect(form.values.value.cpf).toBe('')
    expect(form.values.value.personType).toBe('')
  })

  it('each assembly has its own state', () => {
    const first = toForm(buildFields())
    const second = toForm(buildFields())

    first.set({ cpf: '111' })

    expect(second.values.value.cpf).toBe('')
  })

  /** A sub-component consumes the same instance without registering effects again. */
  it('onChange runs once across several consumers', async () => {
    const spy = vi.fn()

    const domain = defineFormDomain('effects-once', () => {
      const f = refFields({ trigger: { label: 'Trigger', value: '' } })
      addRule(f.trigger, { onChange: value => spy(value) })
      return { fields: f }
    })

    const pai = domain()
    domain()
    domain()

    pai.set({ trigger: 'x' })
    await nextTick()

    expect(spy).toHaveBeenCalledOnce()
  })
})
