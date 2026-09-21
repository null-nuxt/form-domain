<script setup lang="ts">
/**
 * The project's generic input. Note it declares only what it uses —
 * `register()` sends `options` only when the field has them, and `mask` comes
 * from the playground's own extender (plugins/form-bindings.ts) — so nothing is
 * left over to land as a stray DOM attribute.
 */
defineProps<{
  name: string
  label: string
  modelValue: string
  placeholder?: string
  mask?: string
}>()

defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label style="display:grid; gap:.2rem; font-size:.85rem">
    {{ label }}
    <input
      :name="name"
      :value="modelValue"
      :placeholder="placeholder"
      style="padding:.4rem; border:1px solid #d4d4d8; border-radius:.3rem"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
    <small
      v-if="mask"
      style="opacity:.5"
    >máscara: {{ mask }}</small>
  </label>
</template>
