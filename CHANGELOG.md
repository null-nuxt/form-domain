# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`form.validate(keys)`** takes an optional list of keys, for validating part
  of a form — a step's, before a wizard advances. It reads the same `shape` the
  full run reads, so a subset cannot conclude something different from the
  submit. `validateField` is now that call with one key.

- **`refSteps({ who, where })`**, for a form shown in parts. The steps are keyed
  by name and every one's declaration is merged into a single tree, so a rule in
  the last step reads a value from the first and the payload stays one
  projection. `next()` validates the active step's keys and advances only if
  they pass; `back()` and `goTo()` move backwards. A field key declared by two
  steps fails to compile, and so does a step named with a number, which the
  runtime would reorder.

- **`defineFields({ ... })`**, for a declaration living in its own file: it
  returns what it was given, and exists so the editor completes it and so a bad
  option fails in that file rather than wherever the fragment is used.

- **`mergeFields([a, b])`**, for composing declaration fragments into one flat
  declaration. Fragments are plain data, so they stay reusable at module scope,
  and merging before `refFields()` is what types every field with the whole tree
  — a rule from one fragment can patch a key from another. A key declared twice
  fails to compile, on the fragment doing the overriding.

### Fixed

- **The guard against shared state follows the field, not the record.** It
  marked the fields object, so two records holding the same built field — which
  is what composing fragments makes easy — drove two forms with one piece of
  reactive state and nothing said so. Every field is marked now, and the
  warning names the keys.

## 0.1.0 — 2026-09-21

First release from this repository. The package lived in a monorepo until
`form-domain@0.6.0`; the version restarts here because nothing outside a few
test projects ever pinned it. The old history is kept at
[null-nuxt/null-nuxt](https://github.com/null-nuxt/null-nuxt), though the
reasoning behind each decision lives in the code comments, which came along.

### Added

- **Fields declared as inert data**, built by `refFields()` inside the setup, so
  no reactive state lives at module scope and one request cannot drive the form
  another request filled in.

- **`addRule` / `addRules`** for visibility, derived option lists and reactions
  to a change, and **`addSchema` / `addSchemas`** for validators — anything
  implementing Standard Schema.

- **`toForm()` and `defineFormDomain()`**, with the engine behind both: `values`,
  `visible`, `canShow`, `selected`, `options`, `shape`, `composeSchema`,
  `validate`, `validateField`, `register`, `set`, `reset` and `dispose`.

- **`meta` on a declaration** for whatever the project carries on a field, and
  **`extendFormBindings()`** for mapping it onto the project's own components
  without the engine ever interpreting it.

- **A catalog of domains**, found in every layer's `forms/` and reachable
  through `useFormDomain`, `useFormDomains` and `useFormDomainsMetadata`.
