import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectDomainFiles, findDomainFiles } from '../src/module'

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
