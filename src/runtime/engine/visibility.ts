/** What it takes to know whether a field is currently shown, and writable. */
interface Conditioned {
  rule?: { canShow?: () => boolean, canEdit?: () => boolean }
  groups?: Array<{ canShow?: () => boolean, canEdit?: () => boolean }>
}

/**
 * Whether a field is shown, and therefore validated.
 *
 * Its own rule can hide it, and so can any group it belongs to — a wizard step
 * being skipped, a section that does not apply. Every one of them has to agree.
 * One function for all of it, because a field hidden for one reason and
 * validated because of another is a form that cannot be submitted and cannot
 * say why.
 */
export const isVisible = (field: Conditioned): boolean =>
  (field.rule?.canShow?.() ?? true) !== false
  && (field.groups ?? []).every(group => (group.canShow?.() ?? true) !== false)

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
  && (field.groups ?? []).every(group => (group.canEdit?.() ?? true) !== false)
