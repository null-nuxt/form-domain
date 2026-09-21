import type { FieldsInput } from '../fields/declare'

/** A named slice of the form's declaration. Inert, like the declaration itself. */
export interface StepInput<TName extends string = string, T extends FieldsInput = FieldsInput> {
  name: TName
  fields: T
}

/**
 * Declares one step of a wizard: a name, and the fields shown while it is the
 * active one.
 *
 * `define` rather than `ref`, following what the prefixes promise here — this
 * builds nothing and holds nothing. The fields are still a declaration, so a
 * step lives at module scope beside the fragments it is made of, and two forms
 * using the same step share no state.
 *
 * A step is not a form. Every step's fields end up in ONE tree, which is what
 * lets a rule in the last step read a value from the first, and what keeps the
 * payload a single projection instead of a join.
 */
export const defineStep = <TName extends string, T extends FieldsInput>(
  name: TName,
  fields: T,
): StepInput<TName, T> => ({ name, fields })
