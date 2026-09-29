/**
 * What the module generates, with one file under `forms/` that exports
 * something else — the case the catalog has to survive.
 */
const domain = Object.assign(() => ({ id: 'real', fields: {} }), {
  id: 'real',
  metadata: { title: 'A real one' },
})

const helper = { notADomain: true }

export default [domain, helper]

export const files = ['forms/real', 'forms/helper']
