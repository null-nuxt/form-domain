/** What it takes to know whether a field is currently shown, and writable. */
interface Conditioned {
  rule?: { canShow?: () => boolean, canEdit?: () => boolean, clearWhenHidden?: boolean }
  groups?: Array<{ canShow?: () => boolean, canEdit?: () => boolean, clearWhenHidden?: boolean }>
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

/**
 * Whether what the field holds should go, now that it is hidden.
 *
 * Asked of whatever is hiding it, not of everything attached to it. A field can
 * be in a section that does not apply — which takes its values with it — and in
 * one that was filled in and folded away, which must not: the same address can
 * sit inside a toggle and inside a postcode lookup, and reading
 * `clearWhenHidden` off all of them meant a resolved lookup erasing what the
 * person typed under the toggle.
 *
 * So a condition that says no is the one that decides, and when several do, one
 * of them asking is enough — a section going away does not become survivable
 * because something else went away with it.
 *
 * A rule that asks for it WITHOUT a `canShow` of its own is a different
 * sentence: it never hides anything, so it was never about one reason. That is a
 * field, or a group, saying "when I am hidden, drop what I hold" — whoever did
 * the hiding, a skipped step included.
 */
export const clearsWhenHidden = (field: Conditioned): boolean => {
  const conditions = [field.rule, ...(field.groups ?? [])]

  return conditions.some((condition) => {
    if (condition?.clearWhenHidden !== true) return false

    return condition.canShow ? condition.canShow() === false : true
  })
}
