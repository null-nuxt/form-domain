// `#forms` is the package's public entry point
export { mergeFields, refField, refFields } from './field'
export { addRule, addRules, addSchema, addSchemas } from './register'
export { defineFormDomain, toForm } from './define'
export { extendFormBindings } from './bindings'

export type { FormBindingsExtender } from './bindings'

export type {
  BuiltFields,
  FieldInput,
  FieldObj,
  FieldRule,
  FieldsInput,
  MergedFields,
} from './field'

export type { SchemaSource } from './register'

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
} from './define'
