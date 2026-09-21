import { string } from 'yup'
import { addRules, addSchemas } from '#forms'
import type { Fields } from '../fields'
import { regionsFor, regionValues } from '../regions'

export function region(fields: Fields) {
  addRules(fields, {
    /**
     * `onChange` because `region` does NOT disappear when the type changes — it
     * stays visible, but the set of valid values moved and whatever was chosen
     * stopped being one of them. Visibility can't express that.
     */
    personType: { onChange: (_value, ctx) => ctx.patch({ region: '' }) },

    region: {
      // with no type chosen there is no region that makes sense
      canShow: () => fields.personType.value !== '',
      deriveOptions: () => regionsFor(fields),
    },
  })

  addSchemas(fields, {
    personType: string().required('Choose a person type'),

    /**
     * A getter, not a value: the accepted list changes with the person type. A
     * plain validator is read once, which is right for what never changes and
     * wrong for what does.
     */
    region: () => string()
      .required('Choose a region')
      .oneOf(regionValues(fields), 'Invalid region for this person type'),
  })
}
