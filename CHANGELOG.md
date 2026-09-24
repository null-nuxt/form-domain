# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **An inspector**, in dev: a **Forms** tab in Nuxt DevTools, and the same page
  at `/__forms`. Every domain built in the app, with what each field holds, the
  rule attached to it, whether it is being validated right now, its options and
  `meta`, and what a session is showing for it. It reads and writes nothing.

- **`session.touched`**, the fields visited so far — what decides, together with
  `attempts`, whether a message is shown. Sessions also announce themselves per
  request, which is how the inspector finds them.

### Added

- **`loadOptions`**, a rule for a list that has to be fetched. What it reads
  before its first `await` is what re-runs it, the rule `watchEffect` follows,
  so no dependency is declared and no trigger wired. A slower answer to an older
  question loses; `loadingOptions` says while one is in flight; a failed load
  leaves the list and the value alone, and a successful one drops a value the
  new list no longer offers.

- **`field.touch`**, published by a session for as long as it lives, so a
  project wires "this field was visited" through its own extender instead of
  repeating an event binding on every input. There is still exactly one
  `register()`: naming the event is the project's call, the same way naming the
  prop that carries a message is.

- **`canEdit`**, a rule for a field something else decides — a city filled in
  from a postcode. Unlike `canShow` it does not take the field out of
  validation: what it holds still has to be right, and locking says who may
  write it. `register()` sends `disabled` while it is shut and the engine
  refuses the write, so it holds whether or not the component honoured the prop;
  `set()` and a rule's `patch()` still fill it. The map is `form.canEdit`.

### Changed

- **A field's message is re-derived when a related field changes**, not only
  when its own value does. A validator can be about more than the field it is
  attached to, so correcting the password is what clears the message on the
  confirmation — every field already asked about answers again, once per burst
  of typing rather than once per keystroke.

### Fixed

- **`declare module '#forms'` resolves in a project that imports nothing from
  `#forms`.** An augmentation only resolves if something in the program has
  referenced the module, and a project living on auto-imports never does —
  TypeScript then reports `module '#forms' cannot be found` on the augmentation,
  which is not where the problem is. The module generates that reference itself.

### Changed

- **One way to keep something per request.** The registry, the binding extenders
  and now the sessions all needed the same thing, and each had its own copy of
  it; `perRequest` is that thing, once. The registry is reactive as well, so a
  panel watching it sees a form the moment it is built.

## 0.2.0 — 2026-09-21

0.1.0 was the module as it arrived from the monorepo. This is the first release
written here, and it is mostly about the two things a form does that the engine
had no answer for: being shown in parts, and being sent.

Steps are the first. A wizard is one tree sliced by name, not several forms, so
a rule in the last step still reads the first one's value and the payload stays
one projection. What a step needs beyond that — skipping one that doesn't apply,
reopening where the user left off, saving each one as it is approved — follows
from the same place rather than from a second mechanism.

Sending is the second, and it drew a line: the form answers what is true of the
fields, the session remembers what was tried. Nothing in it writes back into the
engine, and nothing in it invents a second `register()`.

### Added

- **`form.validate(keys)`** takes an optional list of keys, for validating part
  of a form — a step's, before a wizard advances. It reads the same `shape` the
  full run reads, so a subset cannot conclude something different from the
  submit. `validateField` is now that call with one key.

- **`useFormSession(form)`**, for what the form has no business keeping: the
  submit that failed, the message a server sent back, whether a field was
  visited. It validates before calling the handler, hands it the payload, and
  ignores a second call while the first is in flight.

  The form stays the truth and the session the memory. Nothing shows while a
  form is only being filled; after an attempt — or a `touch(key)` — the field
  answers again on every change; a server's message lives until the value it
  spoke about changes; and a hidden field has no message at all. With a wizard
  it also gains `next()`.

  There is no `session.register`: the message is written onto the field, and the
  project maps it onto its own input's prop with `extendFormBindings`, exactly
  as it maps `meta.mask`.

- **`refSteps({ who, where })`**, for a form shown in parts. The steps are keyed
  by name and every one's declaration is merged into a single tree, so a rule in
  the last step reads a value from the first and the payload stays one
  projection. `next()` validates the active step's keys and advances only if
  they pass; `back()` and `goTo()` move backwards. A field key declared by two
  steps fails to compile, and so does a step named with a number, which the
  runtime would reorder.

- **A gate before a step is left**: `steps.next(gate)` runs it once the step has
  validated and stays put if it returns `false`, and `session.next(handler)`
  fills it in with that step's values and the step name — for a wizard that
  saves each approved step to the server, and for a server that can still
  refuse it.

- **`steps.resume(name)` and `steps.isStepName(value)`**, for reopening a wizard
  where it was left — a URL fragment, a saved draft. `resume` repeats `next()`
  rather than jumping, so it stops at the first step the data does not support;
  `isStepName` narrows a string from outside the types, so the cast happens once
  instead of at every call.

- **`addStepRules(steps, { name: { canShow } })`**, for a step that only applies
  to some answers. A step that doesn't apply is walked past, and its fields go
  with it — hidden, unvalidated, and not required on submit, since skipping a
  step while still asking for its fields is a form that cannot be sent and
  cannot say why.

- **`defineFields({ ... })`**, for a declaration living in its own file: it
  returns what it was given, and exists so the editor completes it and so a bad
  option fails in that file rather than wherever the fragment is used.

- **`mergeFields([a, b])`**, for composing declaration fragments into one flat
  declaration. Fragments are plain data, so they stay reusable at module scope,
  and merging before `refFields()` is what types every field with the whole tree
  — a rule from one fragment can patch a key from another. A key declared twice
  fails to compile, on the fragment doing the overriding.

### Changed

- **An extender is written as a plain object.** A key it returns as `undefined`
  is left out, instead of being copied over as an undefined value, so the common
  extender stops being a spread of conditionals. It means "nothing to add for
  this field", not "remove what the engine put there".

- **`CustomFieldBindings` is no longer generic** over the form and the key.
  TypeScript requires an augmentation to repeat a type parameter list exactly,
  so every project paid for two generics, an import and a lint exception in
  order to type keys that in practice are flat.

### Fixed

- **A step rule attached after something had already read `canShow` is seen.**
  The step conditions lived in a plain `Map`, so a rule added inside a branch,
  or by a composable the setup calls later, left the navigation stale. A field's
  rule lands on a reactive field and got this for free; the map had to ask.

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
