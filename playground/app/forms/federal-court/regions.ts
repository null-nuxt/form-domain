import type { Fields } from './fields'

const REGIONS_INDIVIDUAL = [
  { label: '1st Region', value: 'first' },
  { label: '2nd Region', value: 'second' },
]

const REGIONS_COMPANY = [{ label: 'National', value: 'national' }]

/**
 * One source for the valid regions. The rules build the select from it and the
 * schema validates against it — without that, the list the UI offers and the
 * one the backend accepts drift apart in silence.
 *
 * With no person type chosen the list is EMPTY, not the company one: treating
 * "not an individual" as "a company" is the same mistake the hand-written
 * clearing used to make with its `else`.
 *
 * It takes the fields directly rather than a context type from the package:
 * what crosses the boundary is derived from this domain's own declaration.
 */
export const regionsFor = (fields: Fields) => {
  if (fields.personType.value === 'PF') return REGIONS_INDIVIDUAL
  if (fields.personType.value === 'PJ') return REGIONS_COMPANY
  return []
}

export const regionValues = (fields: Fields) => regionsFor(fields).map(option => option.value)
