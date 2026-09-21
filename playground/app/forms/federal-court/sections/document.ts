import { string } from 'yup'
import { addRules, addSchemas } from '#forms'
import type { Fields } from '../fields'

/**
 * The whole document block in one file: the rule AND the validation for
 * CPF/CNPJ.
 *
 * This is what the format allows and the builder did not — `withRules` could
 * only be called once, with everything inside, so splitting had to follow the
 * layers. Here the unit is the block, which is what you actually navigate.
 */
export function document(fields: Fields) {
  const isIndividual = () => fields.personType.value === 'PF'
  const isCompany = () => fields.personType.value === 'PJ'

  addRules(fields, {
    /**
     * `clearWhenHidden` because these genuinely disappear: the condition is
     * already in `canShow`, and restating it in a manual reset gets the empty
     * value wrong.
     */
    cpf: { canShow: isIndividual, clearWhenHidden: true },
    cnpj: { canShow: isCompany, clearWhenHidden: true },
  })

  /** No `.when()`: hidden drops out of validation, and the condition was stated once. */
  addSchemas(fields, {
    cpf: string().required('CPF is required').length(11, 'CPF has 11 digits'),
    cnpj: string().required('CNPJ is required').length(14, 'CNPJ has 14 digits'),
  })
}
