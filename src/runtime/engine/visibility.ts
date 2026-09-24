/** What it takes to know whether a field is currently shown, and writable. */
interface Conditioned {
  rule?: { canShow?: () => boolean, canEdit?: () => boolean }
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

/**
 * Whether the field can be typed in.
 *
 * Kept apart from `isVisible` because the two answer different questions: a
 * hidden field is not validated, a locked one still is. What it holds was
 * decided by something else — a postcode lookup, a server — and still has to be
 * right.
 */
export const isEditable = (field: Conditioned): boolean =>
  (field.rule?.canEdit?.() ?? true) !== false
