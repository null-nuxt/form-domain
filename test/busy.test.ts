import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { addRules } from '../src/runtime/fields/register'
import { refFields } from '../src/runtime/fields/declare'
import { toForm } from '../src/runtime/domain/define'

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * A field that is waiting on something. The list had `loadingOptions` and an
 * input got it for free; a rule that went and asked something had nothing, so
 * every project that looks up a postcode returned a ref of its own and wired it
 * into each input by hand.
 */
describe('a field that is busy', () => {
  const build = () => refFields({
    postcode: { label: 'Postcode', value: '' },
    street: { label: 'Street', value: '' },
    city: { label: 'City', value: '' },
  })

  const lookup = (fields: ReturnType<typeof build>, ms = 20) => addRules(fields, {
    postcode: {
      onChange: async (postcode, { patch, busy }) => {
        busy('street', 'city')
        await wait(ms)
        patch({ street: 'Rua A', city: 'Recife' })
      },
    },
  })

  it('holds the field whose handler is running, without being told to', async () => {
    const fields = build()
    lookup(fields)
    toForm(fields)

    fields.postcode.value = '50000000'
    await nextTick()
    expect(fields.postcode.busy).toBe(true)

    await wait(40)
    expect(fields.postcode.busy).toBe(false)
  })

  /** The inputs with nothing to show are the ones being filled in. */
  it('holds the fields the handler named, for as long as it runs', async () => {
    const fields = build()
    lookup(fields)
    toForm(fields)

    fields.postcode.value = '50000000'
    await nextTick()

    expect(fields.street.busy).toBe(true)
    expect(fields.city.busy).toBe(true)

    await wait(40)

    expect(fields.street.busy).toBe(false)
    expect(fields.city.value).toBe('Recife')
  })

  it('frees them when the handler throws, and says so', async () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fields = build()
    addRules(fields, {
      postcode: {
        onChange: async (_postcode, { busy }) => {
          busy('city')
          await wait(5)
          throw new Error('the network fell over')
        },
      },
    })

    toForm(fields)
    fields.postcode.value = '50000000'
    await nextTick()
    expect(fields.city.busy).toBe(true)

    await wait(20)

    expect(fields.city.busy).toBe(false)
    expect(fields.postcode.busy).toBe(false)

    /**
     * Nobody awaits a watcher's callback, so a throw that is not reported here
     * is an unhandled rejection naming neither the field nor the rule.
     */
    expect(reported).toHaveBeenCalledWith(
      expect.stringContaining('the onChange of "postcode" threw'),
      expect.any(Error),
    )

    reported.mockRestore()
  })

  /**
   * Two handlers waiting on one field: the first to finish must not say it is
   * free, which is why the field counts what is holding it.
   */
  it('stays busy until the last handler holding it is done', async () => {
    const fields = build()

    addRules(fields, {
      postcode: {
        onChange: async (_value, { busy }) => {
          busy('city')
          await wait(5)
        },
      },
      street: {
        onChange: async (_value, { busy }) => {
          busy('city')
          await wait(40)
        },
      },
    })

    toForm(fields)

    fields.postcode.value = '50000000'
    fields.street.value = 'Rua A'
    await nextTick()
    expect(fields.city.busy).toBe(true)

    // the quick one is done; the slow one is not
    await wait(20)
    expect(fields.city.busy).toBe(true)

    await wait(40)
    expect(fields.city.busy).toBe(false)
  })

  /** Stashed and called later there would be nothing left to free it. */
  it('ignores a busy() call that arrives after the handler settled', async () => {
    const fields = build()
    let later: ((...keys: Array<'street' | 'city'>) => void) | undefined

    addRules(fields, {
      postcode: {
        onChange: (_value, { busy }) => {
          later = busy
        },
      },
    })

    toForm(fields)
    fields.postcode.value = '50000000'
    await wait(0)

    later?.('city')

    expect(fields.city.busy).toBe(false)
  })

  /** One boolean for the input: a list in flight is the other half of it. */
  it('is true while a list is being fetched', async () => {
    const fields = refFields({
      state: { label: 'State', value: '' },
      city: { label: 'City', value: '', options: [] },
    })

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
    expect(fields.city.busy).toBe(true)

    await wait(40)
    expect(fields.city.busy).toBe(false)
  })
})
