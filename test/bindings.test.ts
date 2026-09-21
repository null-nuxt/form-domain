import { markRaw } from 'vue'
import { describe, expect, it } from 'vitest'
import { refFields } from '../src/runtime/fields/declare'
import { toForm } from '../src/runtime/domain/define'
import { extendFormBindings } from '../src/runtime/engine/bindings'

describe('extendFormBindings', () => {
  it('adds the project\'s own keys to register, reading meta', () => {
    const remove = extendFormBindings(field => field.meta?.mask ? { mask: field.meta.mask } : undefined)

    try {
      const form = toForm(refFields({
        cpf: { label: 'CPF', value: '', meta: { mask: 'cpf' } },
        name: { label: 'Name', value: '' },
      }))

      expect(form.register('cpf')).toMatchObject({ name: 'cpf', mask: 'cpf' })
      expect(form.register('name')).not.toHaveProperty('mask')
    }
    finally {
      remove()
    }
  })

  it('may override a default key, and receives the field key', () => {
    const remove = extendFormBindings((field, { key }) => ({ label: `${field.label} (${key})` }))

    try {
      const form = toForm(refFields({ cpf: { label: 'CPF', value: '' } }))
      expect(form.register('cpf').label).toBe('CPF (cpf)')
    }
    finally {
      remove()
    }
  })

  it('stops applying once removed', () => {
    const remove = extendFormBindings(() => ({ extra: true }))
    remove()

    const form = toForm(refFields({ cpf: { label: 'CPF', value: '' } }))
    expect(form.register('cpf')).not.toHaveProperty('extra')
  })

  /** `undefined` is "nothing to add", so an extender can be the plain object it is. */
  it('leaves out the keys an extender had nothing for', () => {
    const remove = extendFormBindings(field => ({ mask: field.meta?.mask }))

    try {
      const form = toForm(refFields({
        cpf: { label: 'CPF', value: '', meta: { mask: 'cpf' } },
        name: { label: 'Name', value: '' },
      }))

      expect(form.register('cpf')).toMatchObject({ mask: 'cpf' })
      expect(form.register('name')).not.toHaveProperty('mask')
    }
    finally {
      remove()
    }
  })

  /** markRaw is fine on a value the project already marked itself. */
  it('keeps a meta the project had already marked raw', () => {
    const meta = markRaw({ mask: 'cpf' })
    const f = refFields({ cpf: { label: 'CPF', value: '', meta } })
    expect(f.cpf.meta).toBe(meta)
  })
})

describe('the v-model contract is not an extender\'s to replace', () => {
  /**
   * `name`, `modelValue` and `onUpdate:modelValue` are what make `v-bind` a
   * working v-model. An extender that returned any of them used to win: typing
   * stopped reaching the field, silently, while `FieldBindings` still promised a
   * working binding.
   */
  it('keeps writing through the engine even when an extender returns a handler', () => {
    const remove = extendFormBindings(() => ({ 'onUpdate:modelValue': () => {} }) as never)

    try {
      const form = toForm(refFields({ name: { label: 'Name', value: '' } }))
      form.register('name')['onUpdate:modelValue']('typed')

      expect(form.values.value.name).toBe('typed')
    }
    finally {
      remove()
    }
  })

  it('keeps name and modelValue as the engine set them', () => {
    const remove = extendFormBindings(() => ({ name: 'other', modelValue: 'fake' }) as never)

    try {
      const form = toForm(refFields({ name: { label: 'Name', value: 'real' } }))

      expect(form.register('name')).toMatchObject({ name: 'name', modelValue: 'real' })
    }
    finally {
      remove()
    }
  })

  it('still lets an extender override the rest', () => {
    const remove = extendFormBindings(field => ({ label: `${field.label}*` }))

    try {
      const form = toForm(refFields({ name: { label: 'Name', value: '' } }))
      expect(form.register('name').label).toBe('Name*')
    }
    finally {
      remove()
    }
  })
})
