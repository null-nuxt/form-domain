import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // fora do Nuxt o composable cai no registry standalone
      '#imports': fileURLToPath(new URL('./test/stubs/imports.ts', import.meta.url)),
    },
  },
})
