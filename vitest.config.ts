import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

/**
 * Two projects, because the two things worth testing need different worlds.
 *
 * `unit` runs the runtime against stubs — no Nuxt, fast, and it is where all the
 * behaviour is pinned. `nuxt` boots the playground so the public doors are
 * exercised as a project gets them: `#forms` resolved by the module's own alias,
 * `#imports` resolving to a real app, and the registry living on that app rather
 * than on the module-level fallback.
 */
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        resolve: {
          alias: {
            // outside Nuxt the composable falls back to the standalone registry
            '#imports': fileURLToPath(new URL('./test/stubs/imports.ts', import.meta.url)),
            // what the module generates from the files under `forms/`
            '#form-domains': fileURLToPath(new URL('./test/stubs/form-domains.ts', import.meta.url)),
          },
        },
        test: { name: 'unit', include: ['test/*.test.ts'] },
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['test/nuxt/*.test.ts'],
          environment: 'nuxt',
          environmentOptions: { nuxt: { rootDir: fileURLToPath(new URL('./playground', import.meta.url)) } },
        },
      }),
    ],
  },
})
