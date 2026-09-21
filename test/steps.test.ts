import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { string } from 'yup'
import { addRule, addSchemas } from '../src/runtime/fields/register'
import { defineFields } from '../src/runtime/fields/declare'
import { toForm } from '../src/runtime/domain/define'
import { refSteps } from '../src/runtime/steps/create'
import { addStepRules } from '../src/runtime/steps/register'
import type { PersonType } from './support/fields'

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

  /** Attaching is not always done before the first read. */
  it('reaches a canShow something has already computed', () => {
    const steps = buildWizard()
    expect(steps.visibleNames.value).toEqual(['identification', 'location'])

    addStepRules(steps, { location: { canShow: () => false } })

    expect(steps.visibleNames.value).toEqual(['identification'])
  })

  /** A skipped step hides its fields, so `clearWhenHidden` applies to them too. */
  it('clears a field asking for it when its step is skipped', async () => {
    const steps = buildWizard()
    addRule(steps.fields.street, { clearWhenHidden: true })
    addStepRules(steps, { location: { canShow: () => steps.fields.personType.value === 'PJ' } })

    steps.fields.personType.value = 'PJ'
    toForm(steps.fields)
    await nextTick()

    steps.fields.street.value = 'Rua A'
    steps.fields.personType.value = 'PF'
    await nextTick()

    expect(steps.fields.street.value).toBe('')
  })

  /**
   * Reopening where the user left off: the position comes from outside — a URL,
   * a saved draft — and is walked to rather than jumped to.
   */
  it('resumes as far as the data allows', async () => {
    const steps = buildWizard()
    steps.fields.name.value = 'Ana'

    expect(await steps.resume('location')).toBe('location')
    expect(steps.current.value).toBe('location')
  })

  it('stops at the first step the data does not support', async () => {
    const steps = buildWizard()

    expect(await steps.resume('location')).toBe('identification')
  })

  it('names from outside the types are checked, not cast', () => {
    const steps = buildWizard()

    expect(steps.isStepName('location')).toBe(true)
    expect(steps.isStepName('payment')).toBe(false)
  })

  /** A step that doesn't apply is walked past, not shown and skipped over. */
  it('walks past a step that does not apply', async () => {
    const steps = buildWizard()
    addStepRules(steps, { location: { canShow: () => steps.fields.personType.value === 'PJ' } })
    steps.fields.name.value = 'Ana'

    expect(steps.visibleNames.value).toEqual(['identification'])
    expect(steps.isLast.value).toBe(true)

    expect((await steps.next()).valid).toBe(true)
    expect(steps.current.value).toBe('identification')
  })

  /**
   * The trap this closes: a step walked past while its fields stayed in the
   * shape is a form that cannot be submitted and cannot say why.
   */
  it("a skipped step's fields are not required on submit", async () => {
    const steps = buildWizard()
    addStepRules(steps, { location: { canShow: () => steps.fields.personType.value === 'PJ' } })
    steps.fields.name.value = 'Ana'

    const form = toForm(steps.fields)
    expect((await form.validate()).valid).toBe(true)

    steps.fields.personType.value = 'PJ'
    await nextTick()

    expect((await form.validate()).firstErrors.street).toBe('Street is required')
  })

  it('takes the step back into the walk when the data says so', async () => {
    const steps = buildWizard()
    addStepRules(steps, { location: { canShow: () => steps.fields.personType.value === 'PJ' } })

    steps.fields.name.value = 'Ana'
    steps.fields.personType.value = 'PJ'

    expect(steps.visibleNames.value).toEqual(['identification', 'location'])
    await steps.next()
    expect(steps.current.value).toBe('location')
  })

  /** And the step being looked at can be the one that goes away. */
  it('moves off the active step when it stops applying', async () => {
    const steps = buildWizard()
    addStepRules(steps, { location: { canShow: () => steps.fields.personType.value === 'PJ' } })

    steps.fields.name.value = 'Ana'
    steps.fields.personType.value = 'PJ'
    await steps.next()
    expect(steps.current.value).toBe('location')

    steps.fields.personType.value = 'PF'

    expect(steps.current.value).toBe('identification')
  })

  it('refuses to go to a step that does not apply', async () => {
    const steps = buildWizard()
    addStepRules(steps, { identification: { canShow: () => false } })

    steps.goTo('identification')
    expect(steps.current.value).toBe('location')
  })

  /** What the step shows now, not what it declared: a hidden field is dropped. */
  it('activeKeys leaves out a field its own rule is hiding', () => {
    const steps = buildWizard()
    addRule(steps.fields.personType, { canShow: () => false })

    expect(steps.keysOf('identification')).toEqual(['name', 'personType'])
    expect(steps.activeKeys.value).toEqual(['name'])
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
