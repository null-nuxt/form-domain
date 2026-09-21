<script setup lang="ts">
import useFederalCourt from '../forms/federal-court'

/**
 * A sub-component of the same domain: it consumes the instance without taking
 * a single prop, and without registering the watchers again.
 */
const { values, canShow } = useFederalCourt()
</script>

<template>
  <div style="border-left: 3px solid #ddd; padding-left: .75rem; font-size: .875rem">
    <strong>sub-component</strong> — type: {{ values.personType || '—' }} |
    shows cpf: {{ canShow.cpf }}
  </div>
</template>
