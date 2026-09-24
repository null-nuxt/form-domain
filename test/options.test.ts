import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { addRules } from '../src/runtime/fields/register'
import { refFields } from '../src/runtime/fields/declare'
import { toForm } from '../src/runtime/domain/define'

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('options that are fetched', () => {
  const build = () => refFields({
    state: { label: 'State', value: '' },
    city: { label: 'City', value: '', options: [] },
  })

  /**
   * What the function reads before its first `await` is what re-runs it. No
   * dependency is declared anywhere — it is `watchEffect`'s own rule.
   */
  it('asks again when what it read changes', async () => {
    const fields = build()
    const asked: string[] = []

    addRules(fields, {
      city: {
        loadOptions: async () => {
          const state = fields.state.value
          asked.push(state)

          return state ? [{ label: 'Recife', value: 'recife' }] : []
        },
      },
    })

    const form = toForm(fields)
    await wait(0)

    expect(asked).toEqual([''])
    expect(form.options.value.city).toEqual([])

    fields.state.value = 'PE'
    await wait(0)

    expect(asked).toEqual(['', 'PE'])
    expect(form.options.value.city.map(option => option.value)).toEqual(['recife'])
  })

  it('says while it is in flight', async () => {
    const fields = build()
    addRules(fields, {
      city: {
        loadOptions: async () => {
          void fields.state.value
          await wait(20)

          return [{ label: 'Recife', value: 'recife' }]
        },
      },
    })

    toForm(fields)
    await nextTick()
    expect(fields.city.loadingOptions).toBe(true)

    await wait(40)
    expect(fields.city.loadingOptions).toBe(false)
  })

  it('lets a slower answer about an older question lose', async () => {
    const fields = build()
    const delays: Record<string, number> = { PE: 40, SP: 1 }

    addRules(fields, {
      city: {
        loadOptions: async () => {
          const state = fields.state.value
          await wait(delays[state] ?? 0)

          return [{ label: state, value: state.toLowerCase() }]
        },
      },
    })

    const form = toForm(fields)
    fields.state.value = 'PE'
    await nextTick()
    fields.state.value = 'SP'

    await wait(80)

    expect(form.options.value.city.map(option => option.value)).toEqual(['sp'])
  })

  /** A value the new list cannot match is the failure the option check prevents. */
  it('drops what the new list no longer offers', async () => {
    const fields = build()
    addRules(fields, {
      city: {
        loadOptions: async () => {
          const state = fields.state.value

          return state === 'PE'
            ? [{ label: 'Recife', value: 'recife' }]
            : [{ label: 'Santos', value: 'santos' }]
        },
      },
    })

    toForm(fields)
    fields.state.value = 'PE'
    await wait(0)

    fields.city.value = 'recife'
    fields.state.value = 'SP'
    await wait(0)

    expect(fields.city.value).toBe('')
  })

  /** A network that blinked should not empty a select. */
  it('keeps the list it had when loading fails', async () => {
    const fields = build()
    let fail = false

    addRules(fields, {
      city: {
        loadOptions: async () => {
          const state = fields.state.value
          if (fail) throw new Error('offline')

          return state ? [{ label: 'Recife', value: 'recife' }] : []
        },
      },
    })

    const form = toForm(fields)
    fields.state.value = 'PE'
    await wait(0)

    fields.city.value = 'recife'
    fail = true
    fields.state.value = 'SP'
    await wait(0)

    expect(form.options.value.city.map(option => option.value)).toEqual(['recife'])
    expect(fields.city.value).toBe('recife')
    expect(fields.city.loadingOptions).toBe(false)
  })

  it('resolves selected against the fetched list', async () => {
    const fields = build()
    addRules(fields, {
      city: {
        loadOptions: async () => {
          void fields.state.value

          return [{ label: 'Recife', value: 'recife' }]
        },
      },
    })

    const form = toForm(fields)
    await wait(0)
    fields.city.value = 'recife'

    expect(form.selected.value.city?.label).toBe('Recife')
  })
})
