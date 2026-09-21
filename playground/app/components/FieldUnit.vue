<script setup lang="ts">
import type { FieldObj } from '#forms'

/**
 * The second layer, in code: a component that takes THE FIELD rather than the
 * props `register()` builds.
 *
 * `register()` serves one specific input contract — name, label, modelValue,
 * handler. When a component wants the object itself, it reads `label`, `value`
 * and `selected` off it and writes to `value`. A keyed collection can't express
 * that, which is why `fields` stays on the instance.
 *
 * It lives in the playground so the README's rule is checked by typecheck
 * instead of only being described.
 *
 * The `v-model` here trips `vue/no-mutating-props`, and the rule is right in
 * general. Not here: the field is shared reactive state, like a store passed
 * down, and writing to it IS the contract. The rule can't tell the two apart,
 * so the exception is marked at the line.
 */
defineProps<{ field: FieldObj<string> }>()
</script>

<template>
  <label style="display:grid; gap:.2rem">
    <span>{{ field.label }} <small style="opacity:.5">({{ field.key }})</small></span>
    <!-- eslint-disable-next-line vue/no-mutating-props -->
    <input v-model="field.value">
    <small v-if="field.selected" style="opacity:.6">
      chosen: {{ field.selected.label }}
    </small>
  </label>
</template>
