<script setup lang="ts">
const { fields, canShow, options, values, payload, shape, reset, isIndividual, sku, price, summary } = useFormDomain('federal-court')

const fieldsInSchema = computed(() => Object.keys(shape.value))
</script>

<template>
  <main style="font-family: system-ui; padding: 2rem; display: grid; gap: 1rem; max-width: 46rem">
    <h1>@null-nuxt/form-domain</h1>
    <p style="color:#52525b; font-size:.9rem">
      This domain is a setup: the fields in one file, and each block —
      document, region — owning its own rule and its own validation.
    </p>

    <label>
      {{ fields.personType.label }}
      <select v-model="fields.personType.value">
        <option value="">
          —
        </option>
        <option value="PF">
          Pessoa Física
        </option>
        <option value="PJ">
          Pessoa Jurídica
        </option>
      </select>
    </label>

    <label v-if="canShow.cpf">
      {{ fields.cpf.label }}
      <input v-model="fields.cpf.value">
    </label>

    <label v-if="canShow.cnpj">
      {{ fields.cnpj.label }}
      <input v-model="fields.cnpj.value">
    </label>

    <label v-if="canShow.region">
      {{ fields.region.label }}
      <select v-model="fields.region.value">
        <option value="">
          —
        </option>
        <option
          v-for="option in options.region"
          :key="String(option.value)"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
      <small style="opacity:.6"> options and validation come from one list</small>
    </label>

    <!-- the two layers side by side: the field as a unit... -->
    <FieldUnit :field="fields.notes" />

    <FormEcho />

    <div style="display:grid; gap:.4rem; background:#f4f4f5; padding:.8rem; border-radius:.4rem; font-size:.82rem">
      <div><strong>derived</strong>: individual={{ isIndividual }} · sku={{ sku }}</div>
      <div><strong>price</strong>: R$ {{ price.toFixed(2) }}</div>
      <div>
        <strong>cart line</strong>: {{ summary }}
        <br>
        <small style="opacity:.6">
          the field stores <code>{{ values.region || '—' }}</code>; the label is
          derived, so it follows if the list changes
        </small>
      </div>
      <div>
        <strong>payload</strong>: <code>{{ payload }}</code>
        <br>
        <small style="opacity:.6">
          a projection of the form: the region's text lands here without a
          field of its own, and the hidden document stays out
        </small>
      </div>
      <div>
        <strong>schema valida</strong>: {{ fieldsInSchema.join(', ') || '—' }}
        <br>
        <small style="opacity:.6">a hidden field leaves the schema on its own — no <code>.when()</code> in the file</small>
      </div>
    </div>

    <button
      style="justify-self:start"
      @click="reset()"
    >
      reset
    </button>

    <pre style="background: #f4f4f5; padding: 1rem; overflow: auto; font-size:.75rem">{{ values }}</pre>
  </main>
</template>
