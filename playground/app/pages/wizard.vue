<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { string } from 'yup'

/**
 * A wizard declared inside the component. The steps are declarations, keyed by
 * the name each one answers to, and `refSteps` is where the state appears: one
 * fields tree out of all of them, plus where in them we are.
 */
const steps = refSteps({
  who: {
    name: { label: 'Full name*', value: '', placeholder: 'Your full name' },
    email: { label: 'Email*', value: '', placeholder: 'you@example.com' },
    kind: {
      label: 'Profile*',
      value: '' as 'PF' | 'PJ' | '',
      options: [
        { label: 'Individual', value: 'PF' },
        { label: 'Company', value: 'PJ' },
      ],
    },
  },
  company: {
    tradeName: { label: 'Trade name*', value: '' },
  },
  where: {
    postcode: { label: 'Postcode*', value: '', placeholder: '00000-000' },
    city: { label: 'City*', value: '' },
  },
})

/**
 * A step that only applies to some answers. Skipping it takes its fields with
 * it: they are not shown, not validated, and not required on submit.
 */
addStepRules(steps, {
  company: { canShow: () => steps.fields.kind.value === 'PJ' },
})

/** One tree, so the validators are attached once, for the whole form. */
addSchemas(steps.fields, {
  name: string().required('Name is required').min(3, 'Name is too short'),
  email: string().required('Email is required').email('Invalid email'),
  kind: string().required('Profile is required'),
  tradeName: string().required('Trade name is required'),
  postcode: string().required('Postcode is required'),
  city: string().required('City is required'),
})

const { register, values } = toForm(steps.fields)

/** Destructured for the same reason the engine is: the template unwraps refs. */
const { visibleNames, current, activeKeys, isFirst, isLast, back, next } = steps

/**
 * Moving is the wizard's; what moving CAUSES is the page's. Scroll, the URL,
 * analytics — `current` is a computed, so a watcher is the whole mechanism.
 */
const route = useRoute()

watch(current, (name) => {
  history.replaceState(history.state, '', `#${name}`)
  window.scrollTo({ top: 0, behavior: 'smooth' })
})

/**
 * And the way back in. A hash is a string from outside the types, so it is
 * checked rather than cast, and `resume` walks to it through validation instead
 * of dropping the user into the middle of a form they never filled.
 */
onMounted(() => {
  const fromHash = route.hash.slice(1)
  if (steps.isStepName(fromHash)) void steps.resume(fromHash)
})

/**
 * `next()` validates the active step and stays put if it fails. What to do with
 * the messages is the page's business — a session composable will own this.
 */
const errors = ref<string[]>([])
const advance = async () => {
  const result = await next()
  errors.value = Object.values(result.errors).flat()
}
</script>

<template>
  <main style="font-family: system-ui; padding: 2rem; display: grid; gap: 1rem; max-width: 40rem">
    <h1>Wizard</h1>

    <ol style="display:flex; gap:1rem; list-style:none; padding:0; font-size:.85rem">
      <li
        v-for="name in visibleNames"
        :key="name"
        :style="{ fontWeight: name === current ? '600' : '400', color: name === current ? '#18181b' : '#a1a1aa' }"
      >
        {{ name }}
      </li>
    </ol>

    <form
      style="display:grid; gap:.8rem"
      @submit.prevent="advance"
    >
      <!-- only the active step's fields, and register() types each key -->
      <!-- the bindings say which it is: a choice arrives with its list -->
      <template
        v-for="key in activeKeys"
        :key="key"
      >
        <SimpleSelect
          v-if="'options' in register(key)"
          v-bind="register(key)"
        />
        <SimpleInput
          v-else
          v-bind="register(key)"
        />
      </template>

      <div style="display:flex; gap:.5rem">
        <button
          type="button"
          :disabled="isFirst"
          style="padding:.5rem 1rem"
          @click="back()"
        >
          back
        </button>
        <button
          type="submit"
          style="padding:.5rem 1rem"
        >
          {{ isLast ? 'validate' : 'next' }}
        </button>
      </div>
    </form>

    <ul
      v-if="errors.length"
      style="color:#b91c1c; font-size:.85rem"
    >
      <li
        v-for="error in errors"
        :key="error"
      >
        {{ error }}
      </li>
    </ul>

    <pre style="background:#f4f4f5; padding:1rem; font-size:.75rem; overflow:auto">{{ values }}</pre>
  </main>
</template>
