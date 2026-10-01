import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
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

/**
 * The export map points at files a build has not produced yet, so nothing in a
 * test run can import through it. What can be checked is that each path it
 * promises has a source file behind it — a typo there is invisible until
 * someone installs the package and cannot import what the README told them to.
 */
describe('what the package publishes', () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    exports: Record<string, { types: string, import: string }>
  }

  it.each(Object.entries(manifest.exports))('%s is built from a file that exists', (_subpath, target) => {
    for (const promised of [target.types, target.import]) {
      // dist/module.mjs and dist/types.d.mts come from the module entry itself
      const source = promised.replace(/^\.\/dist\/runtime\//, 'src/runtime/')
        .replace(/^\.\/dist\/(module\.mjs|types\.d\.mts)$/, 'src/module.ts')
        .replace(/\.(js|d\.ts)$/, '.ts')

      expect(existsSync(join(root, source)), `${promised} -> ${source}`).toBe(true)
    }
  })
})
