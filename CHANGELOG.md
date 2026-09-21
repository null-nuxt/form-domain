# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
