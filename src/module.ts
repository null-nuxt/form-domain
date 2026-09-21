import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { addImports, addTemplate, createResolver, defineNuxtModule } from '@nuxt/kit'
import type { NuxtModule } from '@nuxt/schema'

export interface ModuleOptions {
  /** Registers `refFields`, the `add*` helpers and the catalog composables. */
  autoImports: boolean
  /** Directory scanned for domains in every layer, relative to each one's srcDir. */
  domainsDir: string
}

/**
 * Finds the domains: `forms/x.ts` or `forms/x/index.ts`. A SYNCHRONOUS scan on
 * purpose — an await inside setup makes Nuxt move past the point where it
 * collects aliases, and the alias disappears from the generated tsconfig.
 */
export const findDomainFiles = (dir: string): Map<string, string> => {
  if (!existsSync(dir)) return new Map()

  /** Keyed by slug: `x/index.ts` and `x.ts` are the SAME domain, not two. */
  const bySlug = new Map<string, string>()

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)

    if (statSync(full).isDirectory()) {
      const index = ['index.ts', 'index.js'].map(file => join(full, file)).find(existsSync)
      // the directory wins: splitting into files was an explicit choice
      if (index) bySlug.set(entry, index)
      continue
    }

    if (!/\.[cm]?[jt]s$/.test(entry) || entry.endsWith('.d.ts')) continue

    const slug = entry.replace(/\.[cm]?[jt]s$/, '')
    if (!bySlug.has(slug)) bySlug.set(slug, full)
  }

  return bySlug
}

/**
 * The same scan over every layer's `forms/`, so a domain shared by two apps lives in
 * a layer instead of being copied into each one.
 *
 * The project comes first in `_layers`, and the first wins: an app overrides a domain
 * a layer gave it, the way it overrides a layer's page or component.
 */
export const collectDomainFiles = (dirs: string[]): string[] => {
  const bySlug = new Map<string, string>()

  for (const dir of dirs) {
    for (const [slug, file] of findDomainFiles(dir)) {
      if (!bySlug.has(slug)) bySlug.set(slug, file)
    }
  }

  return [...bySlug.values()].sort()
}

/**
 * Explicitly annotated: without it the emitted .d.ts references an internal
 * node_modules path and breaks for anyone installing the package (TS2742).
 */
const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@null-nuxt/form-domain',
    configKey: 'forms',
    compatibility: { nuxt: '>=3.13.0' },
  },
  defaults: {
    autoImports: true,
    domainsDir: 'forms',
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    nuxt.options.alias['#forms'] = resolver.resolve('./runtime/index')

    const files = collectDomainFiles(
      nuxt.options._layers.map(layer => resolve(layer.config.srcDir ?? layer.cwd, options.domainsDir)),
    )
    const withoutExtension = (file: string) => file.replace(/\.[cm]?[jt]s$/, '')

    /**
     * The project's domains. The catalog reads `id` and `metadata` straight
     * off these factories, so listing costs no setups; calling one is what
     * builds a form.
     */
    const domainsTemplate = addTemplate({
      filename: 'null-nuxt-form-domains.ts',
      write: true,
      getContents: () => [
        ...files.map((file, index) => `import domain${index} from '${withoutExtension(file)}'`),
        ``,
        // no `as const`: it would make `length` a literal and the catalog's
        // generic runtime would stop compiling (an "impossible" comparison)
        `export default [${files.map((_, index) => `domain${index}`).join(', ')}]`,
        ``,
      ].join('\n'),
    })

    nuxt.options.alias['#form-domains'] = domainsTemplate.dst

    if (options.autoImports) {
      addImports([
        { name: 'refField', from: resolver.resolve('./runtime/fields/declare') },
        { name: 'refFields', from: resolver.resolve('./runtime/fields/declare') },
        { name: 'mergeFields', from: resolver.resolve('./runtime/fields/declare') },
        { name: 'defineStep', from: resolver.resolve('./runtime/steps/declare') },
        { name: 'refSteps', from: resolver.resolve('./runtime/steps/create') },
        { name: 'addRule', from: resolver.resolve('./runtime/fields/register') },
        { name: 'addRules', from: resolver.resolve('./runtime/fields/register') },
        { name: 'addSchema', from: resolver.resolve('./runtime/fields/register') },
        { name: 'addSchemas', from: resolver.resolve('./runtime/fields/register') },
        { name: 'toForm', from: resolver.resolve('./runtime/domain/define') },
        { name: 'extendFormBindings', from: resolver.resolve('./runtime/engine/bindings') },
        { name: 'defineFormDomain', from: resolver.resolve('./runtime/domain/define') },
        { name: 'useFormDomain', from: resolver.resolve('./runtime/domain/catalog') },
        { name: 'useFormDomains', from: resolver.resolve('./runtime/domain/catalog') },
        { name: 'useFormDomainsMetadata', from: resolver.resolve('./runtime/domain/catalog') },
      ])
    }
  },
})

export default module
