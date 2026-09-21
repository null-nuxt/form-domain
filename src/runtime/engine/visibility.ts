/** What it takes to know whether a field is currently shown. */
interface Conditioned {
  rule?: { canShow?: () => boolean }
  groupCanShow?: () => boolean
}

/**
 * Whether a field is shown, and therefore validated.
 *
 * Two conditions can hide it, and either is enough: the field's own rule, and
 * the group it belongs to — a wizard step this form is skipping. One function
 * for both, because a field hidden for one reason and validated because of the
 * other is a form that cannot be submitted and cannot say why.
 */
export const isVisible = (field: Conditioned): boolean =>
  (field.rule?.canShow?.() ?? true) !== false && (field.groupCanShow?.() ?? true) !== false
