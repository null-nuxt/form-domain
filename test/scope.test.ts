import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { string } from 'yup'
import { addGroupRule, addRules, addSchemas } from '../src/runtime/fields/register'
import { defineFields, mergeFields, prefixFields, refFields } from '../src/runtime/fields/declare'
import { scopeOf } from '../src/runtime/fields/scope'
import { toForm } from '../src/runtime/domain/define'
import type { BuiltFields } from '../src/runtime/fields/declare'

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * A fragment that brings its own rules, over a form that renamed its keys. The
 * fragment is written once, against the names it declared, and nothing it brought
 * is rewritten for the second copy.
 */
describe('a fragment scoped onto a form', () => {
  const address = defineFields({
    zipCode: { label: 'Postcode', value: '' },
    street: { label: 'Street', value: '' },
    city: { label: 'City', value: '' },
  })

  /** The recommended shape: a declaration, plus the rules that come with it. */
  const addressRules = (fields: BuiltFields<typeof address>) => {
    addSchemas(fields, { zipCode: string().required('Postcode is required') })

    addRules(fields, {
      zipCode: {
        onChange: async (zipCode, { patch, busy }) => {
          if (zipCode.length !== 8) return patch({ street: '', city: '' })

          busy('street', 'city')
          await wait(5)
          patch({ street: 'Rua A', city: 'Recife' })
        },
      },
      city: { canEdit: () => false },
    })

    return { isResolved: () => fields.city.value !== '' }
  }

  const build = () => {
    const company = prefixFields('company', address)

    const fields = refFields(mergeFields([
      { name: { label: 'Name', value: '' } },
      address,
      company,
    ]))

    return { fields, company }
  }

  it('patches the renamed keys, from rules that never heard of the prefix', async () => {
    const { fields } = build()

    // both copies, from one function, written against the names the fragment declared
    addressRules(scopeOf(address, fields))
    addressRules(scopeOf(address, fields, 'company'))

    const form = toForm(fields)

    fields.companyZipCode.value = '50000000'
    await nextTick()

    expect(fields.companyStreet.busy).toBe(true)
    await wait(20)

    expect(form.values.value.companyStreet).toBe('Rua A')
    expect(form.values.value.companyCity).toBe('Recife')

    // the unprefixed copy was not touched: the view is the whole translation
    expect(form.values.value.street).toBe('')
  })

  it('attaches the schemas and the locks to the real fields', async () => {
    const { fields } = build()
    addressRules(scopeOf(address, fields, 'company'))

    const form = toForm(fields)

    expect(form.register('companyCity').disabled).toBe(true)
    expect((await form.validate()).firstErrors.companyZipCode).toBe('Postcode is required')
  })

  /** What the screen needed out of the fragment, reading the form's own state. */
  it('hands back whatever the rules function returns', async () => {
    const { fields } = build()
    const company = addressRules(scopeOf(address, fields, 'company'))

    toForm(fields)

    expect(company.isResolved()).toBe(false)

    fields.companyCity.value = 'Recife'
    expect(company.isResolved()).toBe(true)
  })

  /** A group takes a fragment, and the view is a fragment of the form's own fields. */
  it('works as the target of a group rule', () => {
    const { fields } = build()
    const view = scopeOf(address, fields, 'company')

    addGroupRule(fields, view, { canShow: () => fields.name.value !== '' })

    const form = toForm(fields)

    expect(form.canShow.value.companyStreet).toBe(false)
    expect(form.canShow.value.street).toBe(true)
  })

  /**
   * A fragment's rules arrive as a function call, which makes it easy to put
   * after the form is built — where the engine has already created its watchers
   * and the lookup silently never runs.
   */
  it('says so when the rules arrive after the form was built', () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fields } = build()

    toForm(fields)
    addressRules(scopeOf(address, fields, 'company'))

    expect(warned).toHaveBeenCalledWith(
      expect.stringContaining('the rule for "companyZipCode" was attached after the form was built'),
    )

    warned.mockRestore()
  })

  it('says so when the prefix does not line up', () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fields } = build()

    // @ts-expect-error the form has no `billing*` keys, which is a compile error first
    scopeOf(address, fields, 'billing')

    expect(warned).toHaveBeenCalledWith(expect.stringContaining('no field named "billingZipCode"'))
    warned.mockRestore()
  })

  /**
   * The hole the view closes: a rule attached outside one patches its own names,
   * which no form renamed to anything.
   */
  it('a rule patching unscoped keys says so instead of writing nothing', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fields = refFields(prefixFields('company', address))

    addRules(fields, {
      companyZipCode: {
        // @ts-expect-error `street` is not a key of this form; the scoped view is
        onChange: (_zip, { patch }) => patch({ street: 'Rua A' }),
      },
    })

    toForm(fields)
    fields.companyZipCode.value = '50000000'
    await wait(0)

    expect(warned).toHaveBeenCalledWith(expect.stringContaining('no field named "street"'))
    warned.mockRestore()
  })
})
