import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { addRule, addRules } from '../src/runtime/fields/register'
import { refField, refFields } from '../src/runtime/fields/declare'
import { defineFormDomain, toForm } from '../src/runtime/domain/define'
import { getFormRegistry } from '../src/runtime/domain/registry'
import { buildFields } from './support/fields'
import type { PersonType } from './support/fields'

describe('assembling inside a component', () => {
  it('derives values and canShow from the rules attached to the field', async () => {
    const form = toForm(buildFields())

    expect(form.canShow.value.cpf).toBe(false)

    form.set({ personType: 'PF' })
    await nextTick()

    expect(form.canShow.value.cpf).toBe(true)
    expect(form.canShow.value.cnpj).toBe(false)
  })

  /** The "no `.when()`" promise: a hidden field never enters validation. */
  it('an individual validates with an empty CNPJ, required or not', async () => {
    const form = toForm(buildFields())
    form.set({ personType: 'PF', cpf: '11111111111' })
    await nextTick()

    expect((await form.validate()).valid).toBe(true)
  })

  it('clears the field that stopped showing', async () => {
    const form = toForm(buildFields())
    form.set({ personType: 'PF', cpf: '111' })
    await nextTick()

    form.set({ personType: 'PJ' })
    await nextTick()

    expect(form.values.value.cpf).toBe('')
  })

  it('visible leaves out what a rule hid; values does not', async () => {
    const form = toForm(buildFields())
    form.set({ personType: 'PJ', cnpj: '222' })
    await nextTick()

    expect(form.visible.value).not.toHaveProperty('cpf')
    expect(form.values.value).toHaveProperty('cpf')
  })

  it('the rule options win, and selected resolves the text', async () => {
    const f = buildFields()
    const form = toForm(f)

    form.set({ personType: 'PF', region: 'first' })
    await nextTick()

    expect(form.options.value.region.map(o => o.value)).toEqual(['first'])
    expect(f.region.selected?.label).toBe('1st Region')
  })

  /** Derived, not stored: change the list and the text follows instead of ageing. */
  it('selected empties when the choice leaves the list', async () => {
    const f = buildFields()
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

describe('onChange: explicit writes', () => {
  const withAutofill = (answer: (value: string) => Promise<string>) => {
    const f = refFields({
      cep: { label: 'CEP', value: '' },
      city: { label: 'City', value: '' },
    })

    addRule(f.cep, {
      onChange: async (value, ctx) => {
        const city = await answer(value)
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

    const form = toForm(withAutofill(async (value) => {
      await new Promise(resolve => setTimeout(resolve, delays[value] ?? 0))
      return `city-${value}`
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
      onChange: (_value, ctx) => ctx.patch({ doesNotExist: 'x' } as never),
    })

    const form = toForm(f)
    f.trigger.value = 'x'
    await nextTick()

    expect(form.values.value).toEqual({ trigger: 'x' })
  })
})

describe('selected on the engine', () => {
  /**
   * It lived only on the field object, and reaching it was the only reason a
   * consumer needed the raw fields — which left two paths to the same value. On
   * the engine, the payload and the component read it flat.
   */
  it('resolves the chosen label without going through the fields', async () => {
    const f = buildFields()
    const form = toForm(f)

    form.set({ personType: 'PF', region: 'first' })
    await nextTick()

    expect(form.selected.value.region?.label).toBe('1st Region')
    expect(form.selected.value.region).toEqual(f.region.selected)
  })

  it('empties when the choice leaves the list', async () => {
    const f = buildFields()
    const form = toForm(f)

    form.set({ personType: 'PF', region: 'first' })
    await nextTick()
    form.set({ personType: 'PJ' })
    await nextTick()

    expect(form.selected.value.region).toBeUndefined()
  })

  it('the payload reads selected straight off the context', async () => {
    const domain = defineFormDomain('selected-payload', () => ({ fields: buildFields() }))
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
