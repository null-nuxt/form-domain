export {}

/**
 * All a project writes to type the keys its extender adds — and nothing else,
 * on purpose: no import, the way a project that lives on auto-imports looks.
 *
 * It compiles only because the module generates a reference to `#forms` of its
 * own. An augmentation resolves only if something in the program has mentioned
 * the module, and if that reference ever goes away the failure lands here,
 * naming the cause, instead of in a project as "module '#forms' cannot be
 * found" pointing at the augmentation.
 */
declare module '#forms' {
  interface CustomFieldBindings {
    pinnedByThisFixture?: string
  }
}
