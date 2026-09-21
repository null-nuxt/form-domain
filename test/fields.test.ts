import { isReactive, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { addRule, addRules } from '../src/runtime/fields/register'
import { mergeFields, refField, refFields } from '../src/runtime/fields/declare'
import { toForm } from '../src/runtime/domain/define'
import type { PersonType } from './support/fields'

describe('a standalone, reusable field', () => {
  /** What justifies the singular `refField()`: a field with its own meta, shared across domains. */
  it('aceita um refField() pronto ao lado das declarações', () => {
    const cpf = refField({ label: 'CPF', value: '', meta: { mask: 'cpf' } })

    const form = toForm(refFields({ cpf, name: { label: 'Name', value: '' } }))

    expect(form.fields.cpf.meta).toEqual({ mask: 'cpf' })
    // the key is only learned at assembly
    expect(form.fields.cpf.key).toBe('cpf')
  })
})

describe('mergeFields', () => {
  /** Fragments are plain data: nothing reactive, so module scope is where they belong. */
  const customer = { name: { label: 'Name', value: '' } }
  const address = { cep: { label: 'CEP', value: '' }, city: { label: 'City', value: '' } }

  it('builds one form out of several fragments', () => {
    const form = toForm(refFields(mergeFields([customer, address])))

    expect(Object.keys(form.values.value)).toEqual(['name', 'cep', 'city'])
    expect(form.register('cep').name).toBe('cep')
  })

  /**
   * What merging declarations buys over merging forms: the fragments are still
   * data afterwards, so the same two build a second form that shares nothing
   * with the first.
   */
  it('leaves the fragments alone, so they compose again', () => {
    const first = toForm(refFields(mergeFields([customer, address])))
    const second = toForm(refFields(mergeFields([customer, address])))

    first.set({ name: 'Ana' })

    expect(second.values.value.name).toBe('')
    expect(customer.name).toEqual({ label: 'Name', value: '' })
  })

  /**
   * And the reason the order matters: merging first means every field is built
   * knowing the whole tree, so a rule declared in one fragment writes into
   * another. Merging built fields would leave each one typed with its own
   * fragment.
   */
  it('lets a rule from one fragment write into another', async () => {
    const fields = refFields(mergeFields([customer, address]))
    addRule(fields.cep, {
      onChange: (value, ctx) => ctx.patch({ city: value === '50000000' ? 'Recife' : '' }),
    })

    const form = toForm(fields)
    form.set({ cep: '50000000' })
    await nextTick()

    expect(form.values.value.city).toBe('Recife')
  })
})

describe('meta', () => {
  /**
   * The engine never interprets it: what `meta.mask` means is a question about
   * the project's inputs, answered by an extender, not by the form.
   */
  it('carries what the declaration put there, and undefined when it put nothing', () => {
    const f = refFields({
      cpf: { label: 'CPF', value: '', meta: { mask: 'cpf' } },
      name: { label: 'Name', value: '' },
    })

    expect(f.cpf.meta).toEqual({ mask: 'cpf' })
    expect(f.name.meta).toBeUndefined()
  })

  /** It is the project's own object, handed back exactly as it was given. */
  it('is stored raw, so nothing inside it turns reactive', () => {
    const f = refFields({ cpf: { label: 'CPF', value: '', meta: { mask: 'cpf' } } })

    expect(isReactive(f.cpf.meta)).toBe(false)
  })

  /** Only an extender decides what reaches the component. */
  it('is never sent to the component on its own', () => {
    const form = toForm(refFields({ cpf: { label: 'CPF', value: '', meta: { mask: 'cpf' } } }))

    expect(form.register('cpf')).not.toHaveProperty('meta')
  })
})

describe('multi-choice and empty-choice fields', () => {
  /**
   * An option holds ONE of the field's entries, not the whole array — typed with
   * the array, a checkbox group was impossible to declare. And `null` is how a
   * field says "nothing chosen yet", never a choice itself.
   */
  const withChoices = () => refFields({
    tags: {
      label: 'Tags',
      value: [] as string[],
      options: [{ label: 'Mail', value: 'mail' }, { label: 'Phone', value: 'phone' }],
    },
    plan: {
      label: 'Plan',
      value: null as string | null,
      options: [{ label: 'Free', value: 'free' }],
    },
    city: { label: 'City', value: '', options: [] },
  })

  it('selected lists the chosen options of a multi-choice field, in list order', () => {
    const form = toForm(withChoices())
    form.set({ tags: ['phone', 'mail'] })

    expect(form.selected.value.tags.map(option => option.value)).toEqual(['mail', 'phone'])
  })

  it('a nullable single choice resolves selected like any other', () => {
    const form = toForm(withChoices())
    expect(form.selected.value.plan).toBeUndefined()

    form.set({ plan: 'free' })
    expect(form.selected.value.plan?.label).toBe('Free')
  })

  /** It is a select even while the list is still on its way. */
  it('register hands a declared choice its list, even while empty', () => {
    const form = toForm(withChoices())

    expect(form.register('city').options).toEqual([])
    expect(form.register('tags').options.map(option => option.value)).toEqual(['mail', 'phone'])
  })
})

describe('a nullable multi-choice field', () => {
  /**
   * `string[]` worked and `string | null` worked, but not both at once: the array
   * check ran before `null` was removed, so the options were typed with the whole
   * array and the declaration was rejected.
   */
  const withTags = () => refFields({
    tags: {
      label: 'Tags',
      value: null as string[] | null,
      options: [{ label: 'Mail', value: 'mail' }, { label: 'Phone', value: 'phone' }],
    },
  })

  it('has nothing selected while null', () => {
    expect(toForm(withTags()).selected.value.tags).toBeUndefined()
  })

  it('lists the chosen options once it holds an array', () => {
    const form = toForm(withTags())
    form.set({ tags: ['phone', 'mail'] })

    expect(form.selected.value.tags?.map(option => option.value)).toEqual(['mail', 'phone'])
  })
})

describe('only declared choices are choices', () => {
  /**
   * `options` and `selected` used to be keyed by EVERY field, which typed a
   * plain text input as though it could hold a choice — the same mistake
   * `register()` had before its extras were made per-field.
   *
   * Declaring `options`, even empty, is the marker. It says "this field holds a
   * choice, the list comes later", and it is what lets a rule derive one.
   */
  const withChoice = () => {
    const f = refFields({
      name: { label: 'Name', value: '' },
      city: { label: 'City', value: '', options: [] },
    })

    addRules(f, { city: { deriveOptions: () => [{ label: 'Recife', value: 'recife' }] } })

    return f
  }

  it('lists only the fields that declared options', () => {
    const form = toForm(withChoice())

    expect(Object.keys(form.options.value)).toEqual(['city'])
    expect(Object.keys(form.selected.value)).toEqual(['city'])
  })

  it('the declared marker is what lets a rule derive the list', () => {
    const form = toForm(withChoice())
    expect(form.options.value.city.map(o => o.value)).toEqual(['recife'])
  })

  it('a field declaring a static list needs no rule', () => {
    const form = toForm(refFields({
      profile: { label: 'Profile', value: '', options: [{ label: 'Lawyer', value: 'adv' }] },
    }))

    expect(form.options.value.profile.map(o => o.value)).toEqual(['adv'])
  })
})

describe('an inert declaration at module scope', () => {
  /**
   * The safe way to move fields out of the domain's file: export the
   * DECLARATION, not the built fields. Plain data is not reactive state, so
   * there is nothing to leak between requests — the hole stops existing rather
   * than being reported by the guard.
   */
  const declaration = {
    personType: { label: 'Kind', value: '' as PersonType },
    profile: { label: 'Profile', value: '', options: [{ label: 'Adv', value: 'adv' }] },
  }

  it('one declaration feeds independent forms, with no warning', () => {
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const first = toForm(refFields(declaration))
    const second = toForm(refFields(declaration))

    first.set({ personType: 'PF' })

    expect(second.values.value.personType).toBe('')
    expect(warnings).not.toHaveBeenCalled()

    warnings.mockRestore()
  })

  it('the declared union survives the round trip through the const', () => {
    const form = toForm(refFields(declaration))

    form.set({ personType: 'PJ' })
    const kind: PersonType = form.values.value.personType

    expect(kind).toBe('PJ')
  })

  it('the declared options reach register', () => {
    const form = toForm(refFields(declaration))
    expect(form.register('profile').options?.map(o => o.value)).toEqual(['adv'])
  })
})
