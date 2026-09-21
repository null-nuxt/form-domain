<script setup lang="ts">
/**
 * Catalog fixture: `useFormDomain('slug')` has to return THAT domain, with its
 * fields and whatever its setup exposed typed — not a union of all of them.
 */
const domain = useFormDomain('federal-court')

// what the setup exposed, typed
const sku: string = domain.sku.value
const price: number = domain.price.value
const isIndividual: boolean = domain.isIndividual.value

// that domain's own fields
const personType: 'PF' | 'PJ' | '' = domain.values.value.personType

// @ts-expect-error a slug that isn't among the discovered domains
useFormDomain('does-not-exist')

// @ts-expect-error this domain exposed no such key
const missing = domain.doesNotExist

/**
 * The catalog reads metadata WITHOUT instantiating: it comes off the factory,
 * not off an instance. If this regresses to an instance read, a listing goes
 * back to running one setup per domain just to render a link.
 */
const catalog = useFormDomainsMetadata()
const title: string | undefined = catalog[0]?.metadata.title
const order: number | undefined = catalog[0]?.metadata.order

// @ts-expect-error metadata declares no such key
const missingMetadata = catalog[0]?.metadata.doesNotExist

const all = useFormDomains()
const howMany: number = all.length
</script>

<template>
  <div>
    {{ sku }} {{ price }} {{ isIndividual }} {{ personType }} {{ missing }}
    {{ title }} {{ order }} {{ missingMetadata }} {{ howMany }}
  </div>
</template>
