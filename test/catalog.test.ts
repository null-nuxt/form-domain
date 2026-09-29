import { describe, expect, it } from 'vitest'
import { useFormDomains, useFormDomainsMetadata } from '../src/runtime/domain/catalog'
import { getFormRegistry } from '../src/runtime/domain/registry'

describe('the catalog', () => {
  /**
   * Everything under `forms/` is imported, and a file there may export
   * something else. Left in, it reaches whoever reads the catalog as
   * `undefined`, and the failure lands far from the file that caused it.
   */
  it('skips a file that does not export a domain', () => {
    expect(useFormDomainsMetadata().map(entry => entry.id)).toEqual(['real'])

    const built = useFormDomains()
    expect(built).toHaveLength(1)

    getFormRegistry().clear()
  })
})
