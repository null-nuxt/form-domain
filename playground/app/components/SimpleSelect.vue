<script setup lang="ts">
defineProps<{
  name: string
  label: string
  modelValue: string
  options?: ReadonlyArray<{ label: string, value: string }>
}>()

defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label style="display:grid; gap:.2rem; font-size:.85rem">
    {{ label }}
    <select
      :name="name"
      :value="modelValue"
      style="padding:.4rem; border:1px solid #d4d4d8; border-radius:.3rem"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">
        —
      </option>
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>
  </label>
</template>
