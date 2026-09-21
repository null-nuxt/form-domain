<script setup lang="ts">
/**
 * The project's generic input. Note it declares only what it uses —
 * `register()` sends `options` only when the field has them, and `mask` and
 * `errorMessage` come from the playground's own extender
 * (plugins/form-bindings.ts) — so nothing is left over to land as a stray DOM
 * attribute. The names are this project's; the module never chose them.
 */
defineProps<{
  name: string
  label: string
  modelValue: string
  placeholder?: string
  mask?: string
  errorMessage?: string
}>()

defineEmits<{ 'update:modelValue': [value: string], blur: [] }>()
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
      @blur="$emit('blur')"
    >
    <small
      v-if="mask"
      style="opacity:.5"
    >mask: {{ mask }}</small>
    <small
      v-if="errorMessage"
      style="color:#b91c1c"
    >{{ errorMessage }}</small>
  </label>
</template>
