import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { isReactive, markRaw, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { string } from 'yup'
import { addRule, addRules, addSchemas } from '../src/runtime/fields/register'
import { defineFormDomain, toForm } from '../src/runtime/domain/define'
import { defineFields, mergeFields, refField, refFields } from '../src/runtime/fields/declare'
import { getFormRegistry } from '../src/runtime/domain/registry'
import { refSteps } from '../src/runtime/steps/create'
import { extendFormBindings } from '../src/runtime/engine/bindings'
import { collectDomainFiles, findDomainFiles } from '../src/module'

type PersonType = 'PF' | 'PJ' | ''

const build = () => {
  const f = refFields({
    personType: { label: 'Person type', value: '' as PersonType },
    cpf: { label: 'CPF', value: '' },
    cnpj: { label: 'CNPJ', value: '' },
    // the empty list is the marker: only a field that declares options gets them
    region: { label: 'Region', value: '', options: [] },
  })

  addRules(f, {
    cpf: { canShow: () => f.personType.value === 'PF', clearWhenHidden: true },
    cnpj: { canShow: () => f.personType.value === 'PJ', clearWhenHidden: true },
    region: {
      deriveOptions: () => f.personType.value === 'PF'
        ? [{ label: '1st Region', value: 'first' }]
        : [{ label: 'Only', value: 'only' }],
    },
  })

  addSchemas(f, {
    cpf: string().required('CPF is required'),
    cnpj: string().required('CNPJ is required'),
  })

  return f
}

describe('assembling inside a component', () => {
  it('derives values and canShow from the rules attached to the field', async () => {
    const form = toForm(build())

    expect(form.canShow.value.cpf).toBe(false)

    form.set({ personType: 'PF' })
    await nextTick()

    expect(form.canShow.value.cpf).toBe(true)
    expect(form.canShow.value.cnpj).toBe(false)
  })

  /** The "no `.when()`" promise: a hidden field never enters validation. */
  it('an individual validates with an empty CNPJ, required or not', async () => {
    const form = toForm(build())
    form.set({ personType: 'PF', cpf: '11111111111' })
    await nextTick()

    expect((await form.validate()).valid).toBe(true)
  })

  it('clears the field that stopped showing', async () => {
    const form = toForm(build())
    form.set({ personType: 'PF', cpf: '111' })
    await nextTick()

    form.set({ personType: 'PJ' })
    await nextTick()

    expect(form.values.value.cpf).toBe('')
  })

  it('visible leaves out what a rule hid; values does not', async () => {
    const form = toForm(build())
    form.set({ personType: 'PJ', cnpj: '222' })
    await nextTick()

    expect(form.visible.value).not.toHaveProperty('cpf')
    expect(form.values.value).toHaveProperty('cpf')
  })

  it('the rule options win, and selected resolves the text', async () => {
    const f = build()
    const form = toForm(f)

    form.set({ personType: 'PF', region: 'first' })
    await nextTick()

    expect(form.options.value.region.map(o => o.value)).toEqual(['first'])
    expect(f.region.selected?.label).toBe('1st Region')
  })

  /** Derived, not stored: change the list and the text follows instead of ageing. */
  it('selected empties when the choice leaves the list', async () => {
    const f = build()
    toForm(f)

    f.personType.value = 'PF'
    f.region.value = 'first'
    await nextTick()
    expect(f.region.selected?.label).toBe('1st Region')

    f.personType.value = 'PJ'
    await nextTick()

    expect(f.region.selected).toBeUndefined()
  })

  it('register sends only what the field has', () => {
    const f = refFields({
      name: { label: 'Name', value: 'Ana', placeholder: 'Digite' },
      profile: { label: 'Profile', value: '', options: [{ label: 'Lawyer', value: 'adv' }] },
    })
    const form = toForm(f)

    expect(form.register('name')).not.toHaveProperty('options')
    expect(form.register('name').placeholder).toBe('Digite')
    expect(form.register('profile').options?.map(o => o.value)).toEqual(['adv'])
  })

  it('the handler writes whatever the component emits', () => {
    const form = toForm(refFields({ name: { label: 'Name', value: '' } }))

    form.register('name')['onUpdate:modelValue']('Ana')
    expect(form.values.value.name).toBe('Ana')
  })

  it('onChange discards a stale response', async () => {
    const spy = vi.fn()
    const f = refFields({
      trigger: { label: 'Trigger', value: '' },
      target: { label: 'Target', value: '' },
    })

    addRule(f.trigger, {
      onChange: (value, ctx) => {
        spy(value)
        ctx.patch({ target: `de-${value}` })
      },
    })

    const form = toForm(f)
    f.trigger.value = 'x'
    await nextTick()

    expect(spy).toHaveBeenCalledWith('x')
    expect(form.values.value.target).toBe('de-x')
  })
})

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

  /** markRaw is fine on a value the project already marked itself. */
  it('keeps a meta the project had already marked raw', () => {
    const meta = markRaw({ mask: 'cpf' })
    const f = refFields({ cpf: { label: 'CPF', value: '', meta } })
    expect(f.cpf.meta).toBe(meta)
  })
})

describe('a shared domain', () => {
  const definir = (id: string) => defineFormDomain(id, { title: 'Certidão', order: 10 }, () => {
    const f = build()
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
      const f = build()
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

describe('the guard against state shared across requests', () => {
  /**
   * The hole the types can't see: `refFields()` at module scope runs once per
   * process, so under SSR the second request drives the objects the first one
   * filled in. The guard doesn't check "was there a scope when it was created" —
   * that would fire in tests and in any helper — but the condition that IS the
   * bug: one fields object driving two forms.
   */
  it('warns when one fields object drives a second form', () => {
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const shared = refFields({ name: { label: 'Name', value: '' } })

    toForm(shared)
    expect(warnings).not.toHaveBeenCalled()

    toForm(shared)
    expect(warnings).toHaveBeenCalledOnce()
    expect(warnings.mock.calls[0]?.[0]).toContain('module scope')

    warnings.mockRestore()
  })

  it('stays quiet when each form builds its own', () => {
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const make = () => refFields({ name: { label: 'Name', value: '' } })

    toForm(make())
    toForm(make())

    expect(warnings).not.toHaveBeenCalled()
    warnings.mockRestore()
  })

  /** Disposing releases the fields, so rebuilding the same form stays quiet. */
  it('stays quiet when rebuilding after disposing', () => {
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const formFields = refFields({ name: { label: 'Name', value: '' } })

    toForm(formFields).dispose()
    toForm(formFields)

    expect(warnings).not.toHaveBeenCalled()
    warnings.mockRestore()
  })

  /**
   * The container is not the leak, the field is. Two records holding one built
   * field share its value, and nothing about either record says so — which is
   * exactly what composing fragments makes easy to do by accident.
   */
  it('warns when one built field reaches a second form through another fields object', () => {
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cpf = refField({ label: 'CPF', value: '' })

    const first = toForm(refFields({ cpf, name: { label: 'Name', value: '' } }))
    expect(warnings).not.toHaveBeenCalled()

    const second = toForm(refFields({ cpf, email: { label: 'E-mail', value: '' } }))

    expect(warnings).toHaveBeenCalledOnce()
    expect(warnings.mock.calls[0]?.[0]).toContain('`cpf`')

    // why it matters: one form's typing lands in the other
    first.set({ cpf: '11111111111' })
    expect(second.values.value.cpf).toBe('11111111111')

    warnings.mockRestore()
  })

  it('stays quiet when the form that held the field was disposed', () => {
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cpf = refField({ label: 'CPF', value: '' })

    toForm(refFields({ cpf, name: { label: 'Name', value: '' } })).dispose()
    toForm(refFields({ cpf, email: { label: 'E-mail', value: '' } }))

    expect(warnings).not.toHaveBeenCalled()
    warnings.mockRestore()
  })

  /**
   * The real SSR case: the setup returns module-scope fields, and the next
   * request runs it again receiving the SAME objects.
   */
  it('catches a domain whose setup returns module-scope fields', () => {
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fromModule = refFields({ name: { label: 'Name', value: '' } })

    const domain = defineFormDomain('setup-leak', () => ({ fields: fromModule }))

    domain()
    getFormRegistry().delete('setup-leak') // simulates the next request
    domain()

    expect(warnings).toHaveBeenCalledOnce()
    warnings.mockRestore()
  })
})

describe('a hidden field and validation', () => {
  it('a company is still asked for its CNPJ', async () => {
    const form = toForm(build())
    form.set({ personType: 'PJ' })
    await nextTick()

    expect((await form.validate()).firstErrors.cnpj).toBe('CNPJ is required')
  })

  it('the opposite document is not asked for, even when dirty', async () => {
    const f = build()
    const form = toForm(f)

    // preenche o CPF enquanto ele ainda aparece, depois troca de grupo
    form.set({ personType: 'PF', cpf: '11111111111' })
    await nextTick()
    form.set({ personType: 'PJ', cnpj: '22222222222222' })
    await nextTick()

    expect((await form.validate()).valid).toBe(true)
  })

  it('returns the field to validation when it shows again', async () => {
    const form = toForm(build())
    expect(Object.keys(form.shape.value)).not.toContain('cpf')

    form.set({ personType: 'PF' })
    await nextTick()

    expect(Object.keys(form.shape.value)).toContain('cpf')
  })

  it('validates one field alone, with the messages of that field only', async () => {
    const form = toForm(build())
    form.set({ personType: 'PF' })
    await nextTick()

    expect(await form.validateField('cpf')).toEqual({ valid: false, errors: ['CPF is required'] })

    form.set({ cpf: '11111111111' })
    expect(await form.validateField('cpf')).toEqual({ valid: true, errors: [] })
  })

  /** Blur and submit must agree: a field `validate()` skips is valid on its own too. */
  it('a hidden field, or one without a validator, is valid on its own', async () => {
    const form = toForm(build())

    expect(await form.validateField('cpf')).toEqual({ valid: true, errors: [] })
    expect(await form.validateField('personType')).toEqual({ valid: true, errors: [] })
  })
})

describe('validating a subset', () => {
  /** What a wizard needs before it advances: this step, not the whole form. */
  it('reports only the keys it was given', async () => {
    const form = toForm(build())
    form.set({ personType: 'PJ' })
    await nextTick()

    const result = await form.validate(['cnpj'])

    expect(Object.keys(result.errors)).toEqual(['cnpj'])
    expect(result.valid).toBe(false)
  })

  it('a key a rule is hiding is valid, the same as in the full run', async () => {
    const form = toForm(build())
    form.set({ personType: 'PJ' })
    await nextTick()

    expect((await form.validate(['cpf'])).valid).toBe(true)
    expect((await form.validate()).errors.cpf).toBeUndefined()
  })

  /** The invariant: one field on its own is the subset of one. */
  it('says the same thing validateField says', async () => {
    const form = toForm(build())
    form.set({ personType: 'PF' })
    await nextTick()

    const [subset, single] = await Promise.all([form.validate(['cpf']), form.validateField('cpf')])

    expect(single).toEqual({ valid: subset.valid, errors: subset.errors.cpf ?? [] })
  })
})

describe('steps', () => {
  /** Declarations, so the same two build every wizard below sharing nothing. */
  const identification = defineFields({
    name: { label: 'Name', value: '' },
    personType: { label: 'Person type', value: '' as PersonType },
  })

  const location = defineFields({
    street: { label: 'Street', value: '' },
  })

  const buildWizard = () => {
    const steps = refSteps({ identification, location })
    addSchemas(steps.fields, {
      name: string().required('Name is required'),
      street: string().required('Street is required'),
    })

    return steps
  }

  it('builds one tree out of every step', () => {
    const form = toForm(buildWizard().fields)

    expect(Object.keys(form.values.value)).toEqual(['name', 'personType', 'street'])
  })

  it('starts on the first step, knowing which keys it shows', () => {
    const steps = buildWizard()

    expect(steps.current.value).toBe('identification')
    expect(steps.isFirst.value).toBe(true)
    expect(steps.isLast.value).toBe(false)
    expect(steps.activeKeys.value).toEqual(['name', 'personType'])
  })

  it('refuses to advance while the active step is invalid', async () => {
    const steps = buildWizard()

    const result = await steps.next()

    expect(result.valid).toBe(false)
    expect(result.firstErrors.name).toBe('Name is required')
    expect(steps.current.value).toBe('identification')
  })

  /** A later step's validator is not this step's problem. */
  it('advances on what the active step asks for, and nothing else', async () => {
    const steps = buildWizard()
    steps.fields.name.value = 'Ana'

    expect((await steps.next()).valid).toBe(true)
    expect(steps.current.value).toBe('location')
    expect(steps.isLast.value).toBe(true)
  })

  it('goes back freely, and forward only through next', async () => {
    const steps = buildWizard()
    steps.fields.name.value = 'Ana'
    await steps.next()

    steps.back()
    expect(steps.current.value).toBe('identification')

    steps.goTo('location')
    expect(steps.current.value).toBe('identification')
  })

  /**
   * One tree is what this buys: a rule declared for a field in the second step
   * reads a value from the first, and hiding it makes the step pass.
   */
  it('a rule in one step reads what another step holds', async () => {
    const steps = buildWizard()
    addRule(steps.fields.street, { canShow: () => steps.fields.personType.value === 'PJ' })

    steps.fields.name.value = 'Ana'
    await steps.next()

    expect(steps.current.value).toBe('location')
    expect((await steps.next()).valid).toBe(true)
  })
})

describe('composeSchema', () => {
  /**
   * Why it exists: composing by hand outside a `computed` freezes the schema
   * at its first value, so a field a rule hides later stays required.
   */
  it('recomposes when visibility changes', async () => {
    const form = toForm(build())
    const composed = form.composeSchema(shape => Object.keys(shape))

    expect(composed.value).not.toContain('cpf')

    form.set({ personType: 'PF' })
    await nextTick()

    expect(composed.value).toContain('cpf')
  })

  it('hands over the declared validators, not an empty copy', () => {
    const form = toForm(build())
    expect(form.composeSchema(shape => shape).value).toBe(form.shape.value)
  })
})

describe('clearing a hidden field', () => {
  const withNotes = () => {
    const f = refFields({
      kind: { label: 'Kind', value: '' as PersonType },
      cpf: { label: 'CPF', value: '' },
      cnpj: { label: 'CNPJ', value: '' },
      notes: { label: 'Notes', value: '' },
    })

    addRules(f, {
      cpf: { canShow: () => f.kind.value === 'PF', clearWhenHidden: true },
      cnpj: { canShow: () => f.kind.value === 'PJ', clearWhenHidden: true },
      notes: { canShow: () => f.kind.value === 'PF' },
    })

    return f
  }

  /**
   * The case a hand-written `onChange` got wrong: going back to empty hides
   * BOTH groups, and the manual version only cleared one.
   */
  it('going back to empty clears both groups', async () => {
    const form = toForm(withNotes())

    form.set({ kind: 'PF', cpf: '111' })
    await nextTick()
    form.set({ kind: 'PJ' })
    await nextTick()
    form.set({ cnpj: '222' })
    form.set({ kind: '' })
    await nextTick()

    expect(form.values.value.cpf).toBe('')
    expect(form.values.value.cnpj).toBe('')
  })

  /** Opt-in because it erases data: in a multi-step form a hidden field keeps it. */
  it('a field without the flag keeps its value even when hidden', async () => {
    const form = toForm(withNotes())

    form.set({ kind: 'PF', notes: 'a note' })
    await nextTick()
    form.set({ kind: 'PJ' })
    await nextTick()

    expect(form.values.value.notes).toBe('a note')
  })

  it('does not clear while the field is still visible', async () => {
    const form = toForm(withNotes())

    form.set({ kind: 'PF', cpf: '111' })
    await nextTick()
    form.set({ cpf: '222' })
    await nextTick()

    expect(form.values.value.cpf).toBe('222')
  })
})

describe('options and schema agreeing', () => {
  /**
   * One source for both. Without it the UI's list and the backend's drift
   * apart in silence — the select offers what the schema rejects.
   */
  const REGIONS_INDIVIDUAL = [{ label: '1st', value: 'first' }]
  const REGIONS_COMPANY = [{ label: 'National', value: 'national' }]

  const withRegion = () => {
    const f = refFields({
      kind: { label: 'Kind', value: '' as PersonType },
      // the empty list is the marker: only a field that declares options gets them
    region: { label: 'Region', value: '', options: [] },
    })

    const list = () => {
      if (f.kind.value === 'PF') return REGIONS_INDIVIDUAL
      if (f.kind.value === 'PJ') return REGIONS_COMPANY
      return []
    }

    addRules(f, { region: { options: list } })
    addSchemas(f, {
      region: () => string().oneOf(list().map(o => o.value), 'Invalid region').required(),
    })

    return f
  }

  it('with no type chosen the options are empty, not the other set', () => {
    const form = toForm(withRegion())
    expect(form.options.value.region).toEqual([])
  })

  it('the schema rejects a value absent from the context options', async () => {
    const form = toForm(withRegion())

    form.set({ kind: 'PF', region: 'national' })
    await nextTick()
    expect((await form.validate()).errors.region).toBeDefined()

    form.set({ region: 'first' })
    await nextTick()
    expect((await form.validate()).errors.region).toBeUndefined()
  })
})

describe('onChange: explicit writes', () => {
  const withAutofill = (answer: (valor: string) => Promise<string>) => {
    const f = refFields({
      cep: { label: 'CEP', value: '' },
      city: { label: 'City', value: '' },
    })

    addRule(f.cep, {
      onChange: async (valor, ctx) => {
        const city = await answer(valor)
        ctx.patch({ city })
      },
    })

    return f
  }

  it('applies an autofill update', async () => {
    const form = toForm(withAutofill(async () => 'Recife'))

    form.set({ cep: '50000000' })
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(form.values.value.city).toBe('Recife')
  })

  /**
   * Why `patch` is a request and not a write: a slow lookup must not overwrite
   * what the user typed afterwards.
   */
  it('discards a stale response', async () => {
    const delays: Record<string, number> = { first: 20, second: 1 }

    const form = toForm(withAutofill(async (valor) => {
      await new Promise(resolve => setTimeout(resolve, delays[valor] ?? 0))
      return `city-${valor}`
    }))

    form.set({ cep: 'first' })
    await nextTick()
    form.set({ cep: 'second' })
    await nextTick()

    await new Promise(resolve => setTimeout(resolve, 40))

    // the first one answered last, and still did not win
    expect(form.values.value.city).toBe('city-second')
  })

  it('ignores an unknown key handed back by the rule', async () => {
    const f = refFields({ trigger: { label: 'Trigger', value: '' } })
    addRule(f.trigger, {
      onChange: (_valor, ctx) => ctx.patch({ doesNotExist: 'x' } as never),
    })

    const form = toForm(f)
    f.trigger.value = 'x'
    await nextTick()

    expect(form.values.value).toEqual({ trigger: 'x' })
  })
})

describe('instance and effects', () => {
  it('reset goes back to the initial values', async () => {
    const form = toForm(build())

    form.set({ personType: 'PF', cpf: '111' })
    await nextTick()
    form.reset()

    expect(form.values.value.cpf).toBe('')
    expect(form.values.value.personType).toBe('')
  })

  it('each assembly has its own state', () => {
    const first = toForm(build())
    const second = toForm(build())

    first.set({ cpf: '111' })

    expect(second.values.value.cpf).toBe('')
  })

  /** A sub-component consumes the same instance without registering effects again. */
  it('onChange runs once across several consumers', async () => {
    const spy = vi.fn()

    const domain = defineFormDomain('effects-once', () => {
      const f = refFields({ trigger: { label: 'Trigger', value: '' } })
      addRule(f.trigger, { onChange: valor => spy(valor) })
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

describe('validators stored on a reactive field', () => {
  /**
   * Zod 4 keeps its internals on a read-only, non-configurable property. Read
   * through a reactive proxy, that property comes back wrapped, which breaks a
   * Proxy invariant and makes every validation throw. Reproduced without zod.
   */
  it('a validator with a frozen internal property still validates', async () => {
    const internals = { checks: [] as unknown[] }
    const validator = {
      '~standard': {
        version: 1 as const,
        vendor: 'frozen-internals',
        validate(value: unknown) {
          // reading through `this`, the way zod does, is what trips the invariant
          void (this as unknown as { owner: { _internals: unknown } }).owner._internals
          return value ? { value } : { issues: [{ message: 'Required' }] }
        },
      },
    }
    Object.defineProperty(validator, '_internals', { value: internals, writable: false, configurable: false })
    Object.defineProperty(validator['~standard'], 'owner', { value: validator, writable: false, configurable: false })

    const f = refFields({ name: { label: 'Name', value: '' } })
    addSchemas(f, { name: validator })
    const form = toForm(f)

    expect(await form.validateField('name')).toEqual({ valid: false, errors: ['Required'] })
    form.set({ name: 'Ana' })
    expect((await form.validate()).valid).toBe(true)
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

describe('selected on the engine', () => {
  /**
   * It lived only on the field object, and reaching it was the only reason a
   * consumer needed the raw fields — which left two paths to the same value. On
   * the engine, the payload and the component read it flat.
   */
  it('resolves the chosen label without going through the fields', async () => {
    const f = build()
    const form = toForm(f)

    form.set({ personType: 'PF', region: 'first' })
    await nextTick()

    expect(form.selected.value.region?.label).toBe('1st Region')
    expect(form.selected.value.region).toEqual(f.region.selected)
  })

  it('empties when the choice leaves the list', async () => {
    const f = build()
    const form = toForm(f)

    form.set({ personType: 'PF', region: 'first' })
    await nextTick()
    form.set({ personType: 'PJ' })
    await nextTick()

    expect(form.selected.value.region).toBeUndefined()
  })

  it('the payload reads selected straight off the context', async () => {
    const domain = defineFormDomain('selected-payload', () => ({ fields: build() }))
      .payload(ctx => ({
        ...ctx.visible,
        region_label: ctx.selected.region?.label ?? '',
      }))

    const form = domain()
    form.set({ personType: 'PF', region: 'first' })
    await nextTick()

    expect(form.payload.value.region_label).toBe('1st Region')
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

describe('dispose', () => {
  /**
   * The README says it stops the effects, and nothing was checking that. A
   * disposed form whose rules still ran would keep clearing and autofilling
   * behind a component that is already gone.
   */
  const withEffects = () => {
    const spy = vi.fn()
    const f = refFields({
      trigger: { label: 'Trigger', value: '' },
      target: { label: 'Target', value: 'intact' },
    })

    addRules(f, {
      trigger: { onChange: value => spy(value) },
      target: { canShow: () => f.trigger.value !== 'hide', clearWhenHidden: true },
    })

    return { fields: f, spy }
  }

  it('stops onChange', async () => {
    const { fields, spy } = withEffects()
    const form = toForm(fields)

    fields.trigger.value = 'first'
    await nextTick()
    expect(spy).toHaveBeenCalledOnce()

    form.dispose()

    fields.trigger.value = 'second'
    await nextTick()
    expect(spy).toHaveBeenCalledOnce()
  })

  it('stops clearWhenHidden', async () => {
    const { fields } = withEffects()
    const form = toForm(fields)

    form.dispose()

    fields.trigger.value = 'hide'
    await nextTick()

    expect(fields.target.value).toBe('intact')
  })

  /** Releasing the claim is what lets the same fields drive a form again. */
  it('releases the fields, so they can drive another form', () => {
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fields } = withEffects()

    toForm(fields).dispose()
    toForm(fields)

    expect(warnings).not.toHaveBeenCalled()
    warnings.mockRestore()
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

describe('a schema that is itself callable', () => {
  /**
   * ArkType's types are functions that also carry `~standard`. Telling a getter
   * from a validator by `typeof === 'function'` called the validator with no
   * argument and used whatever came back as a schema — every validation threw.
   */
  const callableSchema = () => Object.assign((data: unknown) => data, {
    '~standard': {
      version: 1 as const,
      vendor: 'callable',
      validate: (value: unknown) => typeof value === 'string' && value.length > 0
        ? { value }
        : { issues: [{ message: 'Name is required' }] },
    },
  })

  it('validates when declared directly', async () => {
    const fields = refFields({ name: { label: 'Name', value: '' } })
    addSchemas(fields, { name: callableSchema() })

    const form = toForm(fields)
    expect((await form.validate()).firstErrors.name).toBe('Name is required')

    form.set({ name: 'Ana' })
    expect((await form.validate()).valid).toBe(true)
  })

  it('validates when returned from a getter, without being called again', async () => {
    const fields = refFields({ name: { label: 'Name', value: '' } })
    addSchemas(fields, { name: () => callableSchema() })

    expect((await toForm(fields).validateField('name')).errors).toEqual(['Name is required'])
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

describe('finding the domains', () => {
  const make = (files: string[]) => {
    const root = mkdtempSync(join(tmpdir(), 'form-domain-'))
    for (const file of files) {
      mkdirSync(dirname(join(root, file)), { recursive: true })
      writeFileSync(join(root, file), 'export default {}')
    }
    return root
  }

  it('reads `x.ts` and `x/index.ts` as one domain each, the directory winning', () => {
    const dir = make(['a.ts', 'b/index.ts', 'b.ts', 'notes.d.ts'])

    expect([...findDomainFiles(dir).keys()].sort()).toEqual(['a', 'b'])
    expect(findDomainFiles(dir).get('b')).toBe(join(dir, 'b', 'index.ts'))
  })

  /** A domain shared by two apps lives in a layer; the app may override it. */
  it('collects every layer, and the first one wins', () => {
    const app = make(['checkout.ts'])
    const layer = make(['checkout.ts', 'customer.ts'])

    expect(collectDomainFiles([app, layer]).sort()).toEqual([
      join(app, 'checkout.ts'),
      join(layer, 'customer.ts'),
    ].sort())
  })

  it('ignores a layer with no forms directory', () => {
    const layer = make(['customer.ts'])
    expect(collectDomainFiles([join(layer, 'missing'), layer])).toEqual([join(layer, 'customer.ts')])
  })
})
