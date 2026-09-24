---
name: review
description: Review frontend code in task-manager-v2 (apps/frontend, packages/frontend/ui-kit) against the project's UI canon — the UI philosophy, the primitives spec and repo conventions — with the heaviest weight on responsiveness and runtime performance. Use when asked to review a diff, branch, PR, component, hook, story or CSS in the frontend, to check a component "against the docs/design", or before calling a UI change done.
---

# Frontend review against the UI canon

You review code the way the project's philosophy asks: every finding must point at something
visible on screen or measurable in numbers. A rule you cannot tie to a concrete screen, frame
budget or line of code is a slogan — do not raise it.

## Sources of truth

The rules below are distilled from three sources. Cite them by chapter so the author can look
the rule up:

- **Philosophy** — the UI-kit philosophy document (chapters 00–19). Cite as `Philosophy 03`.
- **Primitives** — the primitives component spec (sections 00–11). Cite as `Primitives 02`.
- **Repo** — conventions established in this codebase. Cite as `Repo`.

Details live in the reference files; load the one you need, not all of them:

| File | Load when |
|---|---|
| `references/performance.md` | Always. This is the primary lens of every review |
| `references/philosophy.md` | Screens, interaction, keyboard, states, motion, a11y, text |
| `references/repo-conventions.md` | Always — tokens, surfaces, file layout, tests, stories |

If the original docs are available (the user may attach them, usually from `~/Downloads`),
they win over these summaries when the two disagree. Say so when you notice a divergence.

## Priority order

The philosophy resolves conflicts by principle number: the lower number wins. Rank findings
the same way, so the most important ones come first:

1. **Data integrity** — a lost edit, an optimistic update without rollback, a silent failure.
2. **Response in the first frame** — anything that makes input wait: work in handlers, awaiting
   the network before showing input, spinners without delay, layout thrash, re-render storms.
3. **Keyboard contract** — hotkeys, the Esc ladder, one meaning per key, typing traps.
4. **One place per action** — duplicated logic instead of one data description.
5. **Reversibility over confirmation** — confirm dialogs for reversible actions.
6. **Visible state** — missing empty / loading / error / no-access states.
7. **Density, lines over fills, motion that explains, fewer components** — the rest.

Severity labels:

- **blocker** — breaks priorities 1–2, or a documented hard rule (literal instead of a token,
  a styled UI library, `div` with `onClick`).
- **major** — violates a documented contract with visible effect.
- **minor** — deviates from a convention, low visible impact.
- **nit** — style only. Report at most three nits, or none.

## Workflow

1. **Scope.** Establish what to review: the given files, else the working-tree diff
   (`git diff` plus untracked files under `apps/frontend` and `packages/frontend`), else the
   branch versus `main`. Read each changed file in full, not only the hunks — most canon
   violations sit in the surrounding code the hunk depends on.
2. **Automated guards.** Run and report failures as findings; do not re-derive what they
   already check:
   - `pnpm run check:ds` — token sync and the literal guard.
   - `pnpm nx run-many -t typecheck test -p <affected projects>` when code changed.
     Coverage thresholds live in each `vite.config.mts`; a drop below them fails `test --coverage`.
3. **Performance pass** using `references/performance.md`. Trace every state change the diff
   introduces: who subscribes, what re-renders, what runs per frame, what never gets cleaned up.
4. **Canon pass** using the other references, only for the areas the diff touches.
5. **Verify before reporting.** For each finding, confirm the failure path in the code: name
   the input or interaction that produces it. Drop anything you cannot confirm, or mark it
   explicitly as a question. Fewer, correct findings beat a long list.
6. **Visual check, when a Storybook story or screen changed and a preview is available.** Look
   at the story (both surfaces, if the component has an inverse stand). Rendering claims —
   "the arc doubles at `lg`", "the gap is too wide" — should be seen, not assumed.

## Output

Answer in the language the user writes in; code identifiers stay as they are.

1. One-line verdict: ready / ready after fixes / needs rework.
2. Findings, most severe first. Each one:
   - `severity` · `file:line` · short title
   - what happens (the concrete failure: input → wrong result or cost)
   - the rule, cited (`Philosophy 03`, `Primitives 00`, `Repo`)
   - the fix, as a direction or a small snippet
3. Guard results (pass / fail with the failing lines).
4. Optional, at most three lines: what is done well and worth keeping. Skip it if nothing stands out.

Do not edit code during a review unless the user asks for fixes. If the user disagrees with a
rule, that is a decision to record in the docs, not an exception to make silently
(`Philosophy 19`: change the rule with a date and a reason).

## Known project decisions (do not flag these)

- Components are declared as `const X: React.FC<XProps>` — the user's explicit preference.
- `Spinner` has no `delay` / `minVisible` props: timing lives in `useDelayedFlag`, called by the
  owner of `busy`. The spec's `SpinnerProps` still lists them; the code is right.
- Hotkey registration uses `useRegisterHotkey(config)` rather than the spec's
  `useHotkey(keys, handler)`; the notation for display is `Kbd`'s `keys` string.
- The kit's interaction engines live in `src/interaction/` (hotkeys, escape, layers, cursor).
- The repo is English-only: code, comments, identifiers, docs. UI copy is a product concern.
