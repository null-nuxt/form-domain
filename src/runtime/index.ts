// `#forms` is the package's public entry point
export { mergeFields, refField, refFields } from './fields/declare'
export { addRule, addRules, addSchema, addSchemas } from './fields/register'
export { defineFormDomain, toForm } from './domain/define'
export { extendFormBindings } from './engine/bindings'

export type { FormBindingsExtender } from './engine/bindings'

export type {
  BuiltFields,
  FieldInput,
  FieldObj,
  FieldRule,
  FieldsInput,
  MergedFields,
} from './fields/declare'

export type { SchemaSource } from './fields/register'

export type { FieldValidationResult, ValidationResult } from './standard'

export type {
  AnyFields,
  CustomFieldBindings,
  FieldBindings,
  FieldOption,
  FormEngine,
  MetaOf,
  OptionValue,
  SelectedOf,
  SelectedOptions,
  ValuesOf,
} from './types'

export type {
  FormDomain,
  FormDomainInstance,
} from './domain/define'
