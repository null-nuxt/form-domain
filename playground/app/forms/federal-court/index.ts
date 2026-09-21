import { computed } from 'vue'
import { defineFormDomain, refFields } from '#forms'
import { declaration } from './fields'
import { document } from './sections/document'
import { region } from './sections/region'

/**
 * The catalog entry: nothing here depends on anyone filling the form in, which
 * is why it sits OUTSIDE the setup — running a setup is instantiating, and a
 * listing has to read this without doing that.
 */
export const metadata = {
  title: 'Criminal Record Certificate — Federal Court',
  description: 'Criminal distribution certificate issued by the Federal Court.',
  to: '/services/certificates/federal-court',
  category: 'certificates',
  order: 120,
}

/**
 * The domain's index: the whole thing reads in fifteen lines and says where
 * each part lives. The sections take the fields as an argument — the dependency
 * is a parameter, not a position in a chain.
 */
export default defineFormDomain('federal-court', metadata, () => {
  const fields = refFields(declaration)

  document(fields)
  region(fields)

  const isIndividual = computed(() => fields.personType.value === 'PF')

  return {
    fields,
    isIndividual,
    sku: computed(() => isIndividual.value ? 'CRC-FC-IND' : 'CRC-FC-CO'),
    price: computed(() => isIndividual.value ? 59.9 : 89.9),
    summary: computed(() => fields.region.selected
      ? `Region: ${fields.region.selected.label}`
      : 'No region selected'),
  }
})
  /**
   * The projection for the backend. The region's text lands here WITHOUT a
   * phantom field — that used to cost three declarations across two files.
   *
   * `ctx.visible` rather than `ctx.values`: the opposite group's document is
   * hidden and has no reason to travel.
   */
  .payload(ctx => ({
    ...ctx.visible,
    region_label: ctx.selected.region?.label ?? '',
    price: ctx.price.value,
    sku: ctx.sku.value,
    product: metadata.category,
  }))
