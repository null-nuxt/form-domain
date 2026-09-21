import { string } from 'yup'
import { addRules, addSchemas } from '../../src/runtime/fields/register'
import { refFields } from '../../src/runtime/fields/declare'

export type PersonType = 'PF' | 'PJ' | ''

/**
 * The form most of these need: one choice deciding which document is asked
 * for, and a region whose list is derived from that same choice.
 */
export const buildFields = () => {
  const f = refFields({
    personType: { label: 'Person type', value: '' as PersonType },
    cpf: { label: 'CPF', value: '' },
    cnpj: { label: 'CNPJ', value: '' },
    // the empty list is the marker: only a field that declares options gets them
    region: { label: 'Region', value: '', options: [] },
  })

  addRules(f, {
    cpf: { canShow: () => f.personType.value === 'PF', clearWhenHidden: true },
    cnpj: { canShow: () => f.personType.value === 'PJ', clearWhenHidden: true },
    region: {
      deriveOptions: () => f.personType.value === 'PF'
        ? [{ label: '1st Region', value: 'first' }]
        : [{ label: 'Only', value: 'only' }],
    },
  })

  addSchemas(f, {
    cpf: string().required('CPF is required'),
    cnpj: string().required('CNPJ is required'),
  })

  return f
}
