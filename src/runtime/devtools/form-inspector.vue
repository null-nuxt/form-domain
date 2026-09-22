<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { inspectForms } from './state'

/**
 * What every form built in this request is doing right now: its fields, what
 * each one holds, which rule is attached, whether it is being validated, and
 * what a session is saying about it.
 *
 * Reading only. It walks the per-request registry, so it shows the forms this
 * tab has built — navigate the app, come back, and the domain is still here,
 * because a domain outlives the page that asked for it.
 */
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})

// on the server the registry belongs to a request nobody is looking at
const forms = computed(() => mounted.value ? inspectForms() : [])

const selected = ref('')
const current = computed(() => forms.value.find(form => form.id === selected.value) ?? forms.value[0])

const show = (value: unknown) => {
  if (value === undefined) return '—'
  return typeof value === 'string' ? `"${value}"` : JSON.stringify(value)
}
</script>

<template>
  <main style="font-family: ui-monospace, monospace; font-size: .8rem; padding: 1.5rem; display: grid; gap: 1rem">
    <header>
      <h1 style="font-size: 1rem; margin: 0">
        form-domain
      </h1>
      <p style="color: #71717a; margin: .25rem 0 0">
        The forms built in this tab. Nothing here writes.
      </p>
    </header>

    <p
      v-if="forms.length === 0"
      style="color:#71717a"
    >
      No form has been built yet — open a page that uses one, then come back.
    </p>

    <div
      v-else
      style="display: grid; grid-template-columns: 12rem 1fr; gap: 1.5rem; align-items: start"
    >
      <nav style="display: grid; gap: .25rem">
        <button
          v-for="form in forms"
          :key="form.id"
          type="button"
          :style="{
            textAlign: 'left',
            padding: '.4rem .6rem',
            border: '1px solid #e4e4e7',
            borderRadius: '.3rem',
            background: form.id === current?.id ? '#18181b' : 'transparent',
            color: form.id === current?.id ? '#fafafa' : 'inherit',
            cursor: 'pointer',
          }"
          @click="selected = form.id"
        >
          {{ form.id }}
        </button>
      </nav>

      <section
        v-if="current"
        style="display: grid; gap: 1rem"
      >
        <div
          v-if="current.steps"
          style="display: flex; gap: .5rem; align-items: center; flex-wrap: wrap"
        >
          <strong>steps</strong>
          <span
            v-for="name in current.steps.names"
            :key="name"
            :style="{
              padding: '.15rem .45rem',
              borderRadius: '.25rem',
              background: name === current.steps.current ? '#18181b' : '#f4f4f5',
              color: name === current.steps.current ? '#fafafa' : (current.steps.visible.includes(name) ? '#18181b' : '#a1a1aa'),
              textDecoration: current.steps.visible.includes(name) ? 'none' : 'line-through',
            }"
          >
            {{ name }}
          </span>
        </div>

        <div
          v-if="current.session"
          style="display: flex; gap: 1rem; color: #52525b; flex-wrap: wrap"
        >
          <span><strong>session</strong></span>
          <span>attempts: {{ current.session.attempts }}</span>
          <span>submitting: {{ current.session.isSubmitting }}</span>
          <span>touched: {{ current.session.touched.join(', ') || '—' }}</span>
        </div>

        <table style="border-collapse: collapse; width: 100%">
          <thead style="text-align: left; color: #71717a">
            <tr>
              <th style="padding:.3rem .5rem">
                field
              </th>
              <th style="padding:.3rem .5rem">
                value
              </th>
              <th style="padding:.3rem .5rem">
                shown
              </th>
              <th style="padding:.3rem .5rem">
                validated
              </th>
              <th style="padding:.3rem .5rem">
                rule
              </th>
              <th style="padding:.3rem .5rem">
                options
              </th>
              <th style="padding:.3rem .5rem">
                meta
              </th>
              <th style="padding:.3rem .5rem">
                error
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="field in current.fields"
              :key="field.key"
              :style="{ borderTop: '1px solid #e4e4e7', opacity: field.shown ? 1 : .45 }"
            >
              <td style="padding:.3rem .5rem">
                <strong>{{ field.key }}</strong>
                <div style="color:#a1a1aa">
                  {{ field.label }}
                </div>
              </td>
              <td style="padding:.3rem .5rem">
                {{ show(field.value) }}
              </td>
              <td style="padding:.3rem .5rem">
                {{ field.shown ? 'yes' : 'no' }}
              </td>
              <td style="padding:.3rem .5rem">
                {{ field.validated ? 'yes' : 'no' }}
              </td>
              <td style="padding:.3rem .5rem; color:#52525b">
                {{ field.rule.join(', ') || '—' }}
              </td>
              <td style="padding:.3rem .5rem">
                {{ field.options ?? '—' }}
              </td>
              <td style="padding:.3rem .5rem; color:#52525b">
                {{ field.meta ? show(field.meta) : '—' }}
              </td>
              <td style="padding:.3rem .5rem; color:#b91c1c">
                {{ field.error ?? '—' }}
              </td>
            </tr>
          </tbody>
        </table>

        <details>
          <summary style="cursor:pointer">
            values
          </summary>
          <pre style="background:#f4f4f5; padding:.75rem; overflow:auto">{{ current.values }}</pre>
        </details>

        <details v-if="current.payload !== undefined">
          <summary style="cursor:pointer">
            payload
          </summary>
          <pre style="background:#f4f4f5; padding:.75rem; overflow:auto">{{ current.payload }}</pre>
        </details>
      </section>
    </div>
  </main>
</template>
