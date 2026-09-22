import { describe, expect, it } from 'vitest'
import { string } from 'yup'
import { refFields } from '../src/runtime/fields/declare'
import { addRules, addSchemas } from '../src/runtime/fields/register'
import { toForm } from '../src/runtime/domain/define'
import { getFormRegistry } from '../src/runtime/domain/registry'
import { inspectForms } from '../src/runtime/devtools/state'

describe('the inspector', () => {
  const build = () => {
    const fields = refFields({
      personType: { label: 'Type', value: '' as 'PF' | 'PJ' | '' },
      cpf: { label: 'CPF', value: '', meta: { mask: 'cpf' } },
      region: { label: 'Region', value: '', options: [] },
    })

    addRules(fields, {
      cpf: { canShow: () => fields.personType.value === 'PF', clearWhenHidden: true },
      region: { deriveOptions: () => [{ label: '1st', value: 'first' }, { label: '2nd', value: 'second' }] },
    })

    addSchemas(fields, { cpf: string().required('CPF is required') })

    return toForm(fields)
  }

  it('says what each field holds, and whether it is being validated', () => {
    const form = build()
    getFormRegistry().set('inspected', form)

    try {
      const [inspected] = inspectForms()
      const field = (key: string) => inspected!.fields.find(entry => entry.key === key)!

      expect(inspected!.id).toBe('inspected')
      expect(field('cpf')).toMatchObject({
        label: 'CPF',
        shown: false,
        validated: false,
        rule: ['canShow', 'clearWhenHidden'],
        meta: { mask: 'cpf' },
      })

      // the list a rule is deriving, not the empty one that was declared
      expect(field('region').options).toBe(2)

      form.set({ personType: 'PF' })

      const [after] = inspectForms()
      expect(after!.fields.find(entry => entry.key === 'cpf')).toMatchObject({ shown: true, validated: true })
    }
    finally {
      getFormRegistry().delete('inspected')
    }
  })

  /**
   * What the DevTools tab needs: it runs in an iframe with a Nuxt app of its
   * own, so it hands over the app underneath. The keys are the contract — a
   * rename here is a panel that silently shows nothing.
   */
  it('reads the forms of another app when given one', () => {
    const host = {
      __nuxt_forms__: new Map([['from-the-host', build()]]),
      __nuxt_forms_sessions__: new Set(),
    }

    expect(inspectForms(host).map(form => form.id)).toEqual(['from-the-host'])
    expect(inspectForms(host)[0]!.fields.map(field => field.key)).toEqual(['personType', 'cpf', 'region'])
  })

  it('says nothing about an app that has built no form', () => {
    expect(inspectForms({})).toEqual([])
  })
})
