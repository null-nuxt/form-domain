import type { BuiltFields } from '#forms'

export type PersonType = 'PF' | 'PJ' | ''

/**
 * The field DECLARATION — plain data, not state.
 *
 * That is why it can live at module scope: `refFields()` here would build
 * reactive state shared across requests, and under SSR the second request would
 * drive what the first one filled in. An inert object has nothing to leak, so
 * the failure stops existing rather than being warned about.
 *
 * Construction happens inside the setup, in `index.ts`. The guarantees stay in
 * the constructor: `refFields` still rejects an option whose value doesn't
 * match its field's.
 */
export const declaration = {
  personType: { label: 'Person type', value: '' as PersonType },
  cpf: { label: 'CPF', value: '', meta: { mask: 'cpf' } },
  cnpj: { label: 'CNPJ', value: '', meta: { mask: 'cnpj' } },
  /**
   * The empty list is the marker, not an oversight: declaring `options` is how a
   * field says it holds a choice. That is what lets `region.ts` derive the list,
   * and what keeps `form.options` and `form.selected` from listing text inputs.
   *
   * No annotation needed. It infers as `never[]` and nothing cares — the derived
   * list and `form.options` are both typed from the FIELD's value, never from
   * whatever the declared array happened to hold.
   */
  region: { label: 'Region', value: '', options: [] },
  notes: { label: 'Notes', value: '' },
}

/** What the sections receive, derived from the declaration. */
export type Fields = BuiltFields<typeof declaration>
