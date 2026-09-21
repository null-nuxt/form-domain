import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { string } from 'yup'
import { addRules, addSchemas } from '../src/runtime/fields/register'
import { refFields } from '../src/runtime/fields/declare'
import { toForm } from '../src/runtime/domain/define'
import { buildFields } from './support/fields'
import type { PersonType } from './support/fields'

describe('a hidden field and validation', () => {
  it('a company is still asked for its CNPJ', async () => {
    const form = toForm(buildFields())
    form.set({ personType: 'PJ' })
    await nextTick()

    expect((await form.validate()).firstErrors.cnpj).toBe('CNPJ is required')
  })

  it('the opposite document is not asked for, even when dirty', async () => {
    const f = buildFields()
    const form = toForm(f)

    // fills the CPF while it still shows, then switches group
    form.set({ personType: 'PF', cpf: '11111111111' })
    await nextTick()
    form.set({ personType: 'PJ', cnpj: '22222222222222' })
    await nextTick()

    expect((await form.validate()).valid).toBe(true)
  })

  it('returns the field to validation when it shows again', async () => {
    const form = toForm(buildFields())
    expect(Object.keys(form.shape.value)).not.toContain('cpf')

    form.set({ personType: 'PF' })
    await nextTick()

    expect(Object.keys(form.shape.value)).toContain('cpf')
  })

  it('validates one field alone, with the messages of that field only', async () => {
    const form = toForm(buildFields())
    form.set({ personType: 'PF' })
    await nextTick()

    expect(await form.validateField('cpf')).toEqual({ valid: false, errors: ['CPF is required'] })

    form.set({ cpf: '11111111111' })
    expect(await form.validateField('cpf')).toEqual({ valid: true, errors: [] })
  })

  /** Blur and submit must agree: a field `validate()` skips is valid on its own too. */
  it('a hidden field, or one without a validator, is valid on its own', async () => {
    const form = toForm(buildFields())

    expect(await form.validateField('cpf')).toEqual({ valid: true, errors: [] })
    expect(await form.validateField('personType')).toEqual({ valid: true, errors: [] })
  })
})

describe('validating a subset', () => {
  /** What a wizard needs before it advances: this step, not the whole form. */
  it('reports only the keys it was given', async () => {
    const form = toForm(buildFields())
    form.set({ personType: 'PJ' })
    await nextTick()

    const result = await form.validate(['cnpj'])

    expect(Object.keys(result.errors)).toEqual(['cnpj'])
    expect(result.valid).toBe(false)
  })

  it('a key a rule is hiding is valid, the same as in the full run', async () => {
    const form = toForm(buildFields())
    form.set({ personType: 'PJ' })
    await nextTick()

    expect((await form.validate(['cpf'])).valid).toBe(true)
    expect((await form.validate()).errors.cpf).toBeUndefined()
  })

  /** The invariant: one field on its own is the subset of one. */
  it('says the same thing validateField says', async () => {
    const form = toForm(buildFields())
    form.set({ personType: 'PF' })
    await nextTick()

    const [subset, single] = await Promise.all([form.validate(['cpf']), form.validateField('cpf')])

    expect(single).toEqual({ valid: subset.valid, errors: subset.errors.cpf ?? [] })
  })
})

describe('composeSchema', () => {
  /**
   * Why it exists: composing by hand outside a `computed` freezes the schema
   * at its first value, so a field a rule hides later stays required.
   */
  it('recomposes when visibility changes', async () => {
    const form = toForm(buildFields())
    const composed = form.composeSchema(shape => Object.keys(shape))

    expect(composed.value).not.toContain('cpf')

    form.set({ personType: 'PF' })
    await nextTick()

    expect(composed.value).toContain('cpf')
  })

  it('hands over the declared validators, not an empty copy', () => {
    const form = toForm(buildFields())
    expect(form.composeSchema(shape => shape).value).toBe(form.shape.value)
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
