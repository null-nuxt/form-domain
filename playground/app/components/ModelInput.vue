<script setup lang="ts">
/**
 * Deliberately written the way a project's own input is: `defineModel<string>()`
 * plus optional props. That is what makes it a fixture — `defineModel` without
 * `required` widens the emitted value to `string | undefined`, and `register()`
 * has to stay assignable to that.
 */
defineProps<{
  name: string
  label?: string
}>()

// no default on purpose: the widened `string | undefined` IS what this fixture pins
// eslint-disable-next-line vue/require-default-prop
const model = defineModel<string>()
</script>

<template>
  <label>
    {{ label }}
    <input
      :name="name"
      :value="model"
      @input="model = ($event.target as HTMLInputElement).value"
    >
  </label>
</template>
