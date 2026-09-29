import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // outside Nuxt the composable falls back to the standalone registry
      '#imports': fileURLToPath(new URL('./test/stubs/imports.ts', import.meta.url)),
      // what the module generates from the files under `forms/`
      '#form-domains': fileURLToPath(new URL('./test/stubs/form-domains.ts', import.meta.url)),
    },
  },
})
