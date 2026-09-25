import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { string } from 'yup'
import { addGroupRule, addRules, addSchemas } from '../src/runtime/fields/register'
import { defineFields, refFields } from '../src/runtime/fields/declare'
import { refSteps } from '../src/runtime/steps/create'
import { addStepRules } from '../src/runtime/steps/register'
import { toForm } from '../src/runtime/domain/define'

describe('a rule for a group of fields', () => {
  const address = defineFields({
    street: { label: 'Street', value: '' },
    number: { label: 'Number', value: '' },
    city: { label: 'City', value: '' },
  })

  const build = () => refFields({ kind: { label: 'Kind', value: '' }, ...address })

  it('hides every field in it, and takes them out of validation with it', async () => {
    const fields = build()
    addSchemas(fields, { street: string().required('Street is required') })
    addGroupRule(fields, address, { canShow: () => fields.kind.value === 'company' })

    const form = toForm(fields)

    expect(form.canShow.value.street).toBe(false)
    expect((await form.validate()).valid).toBe(true)

    fields.kind.value = 'company'
    await nextTick()

    expect(form.canShow.value.street).toBe(true)
    expect((await form.validate()).firstErrors.street).toBe('Street is required')
  })

  it('takes a list of keys just as well', () => {
    const fields = build()
    addGroupRule(fields, ['street', 'city'], { canShow: () => false })

    const form = toForm(fields)

    expect(form.canShow.value.street).toBe(false)
    expect(form.canShow.value.city).toBe(false)
    expect(form.canShow.value.number).toBe(true)
  })

  /** The field keeps its own say: both have to agree. */
  it('does not replace what the field says about itself', async () => {
    const fields = build()
    addRules(fields, { number: { canShow: () => fields.street.value !== '' } })
    addGroupRule(fields, address, { canShow: () => fields.kind.value === 'company' })

    const form = toForm(fields)

    fields.kind.value = 'company'
    await nextTick()
    expect(form.canShow.value.number).toBe(false)

    fields.street.value = 'Rua A'
    await nextTick()
    expect(form.canShow.value.number).toBe(true)

    fields.kind.value = 'person'
    await nextTick()
    expect(form.canShow.value.number).toBe(false)
  })

  it('locks every field in it, without taking them out of validation', async () => {
    const fields = build()
    addSchemas(fields, { street: string().required('Street is required') })
    addGroupRule(fields, address, { canEdit: () => false })

    const form = toForm(fields)

    expect(form.canEdit.value.street).toBe(false)
    expect(form.register('street').disabled).toBe(true)
    expect((await form.validate()).firstErrors.street).toBe('Street is required')
  })

  it('clears the whole group when it goes away', async () => {
    const fields = build()
    addGroupRule(fields, address, {
      canShow: () => fields.kind.value === 'company',
      clearWhenHidden: true,
    })

    const form = toForm(fields)
    fields.kind.value = 'company'
    await nextTick()

    form.set({ street: 'Rua A', city: 'Recife' })
    fields.kind.value = 'person'
    await nextTick()

    expect(form.values.value.street).toBe('')
    expect(form.values.value.city).toBe('')
  })

  /** What the single slot could not do: a field inside a step AND inside a section. */
  it('composes with the step a field is in', async () => {
    const steps = refSteps({
      who: { kind: { label: 'Kind', value: '' } },
      where: address,
    })

    addStepRules(steps, { where: { canShow: () => steps.fields.kind.value !== '' } })
    addGroupRule(steps.fields, ['city'], { canShow: () => steps.fields.street.value !== '' })

    const form = toForm(steps.fields)

    expect(form.canShow.value.city).toBe(false)

    steps.fields.kind.value = 'company'
    await nextTick()
    expect(form.canShow.value.city).toBe(false)

    steps.fields.street.value = 'Rua A'
    await nextTick()
    expect(form.canShow.value.city).toBe(true)
  })
})
