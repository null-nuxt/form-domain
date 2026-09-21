import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

export default createConfigForNuxt({
  features: { tooling: true },
})
  .append({
    ignores: [
      '**/dist/**',
      '**/.nuxt/**',
      '**/node_modules/**',
    ],
  })
  // a Nuxt page is named by its route, so the multi-word rule does not apply
  .append({
    files: ['playground/**/pages/**/*.vue', 'playground/**/app.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  })
