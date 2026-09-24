# Repo conventions

What this codebase has settled on, on top of the docs.

## Layout

- Nx monorepo, pnpm. Run tasks through nx: `pnpm nx run-many -t test typecheck -p ui-kit frontend`.
- Kit: `packages/frontend/ui-kit` (`@task-manager-v2/ui-kit`). App: `apps/frontend`.
- Kit `src/`:
  - `tokens/` — `tokens.css` + generated TS/SCSS
  - `components/<Name>/` — `Name.tsx`, `Name.module.(s)css`, `Name.spec.tsx`, `Name.stories.tsx`, `index.ts`
  - `interaction/` — behavior engines without styles: `hotkeys/`, `escape/`, `layers/`, `cursor/`.
    Each module owns its store, types, hooks and tests.
  - `hooks/` — only generic hooks with no module of their own (`useMediaQuery`, `useDelayedFlag`)
  - `utils/` — `cx`, `composeRefs`, `detectPlatform`
- Modules import each other only through their `index.ts`; the kit's public API is `src/index.ts`.
- Domain state (tasks, boards, selection, view, filters) belongs in `apps/frontend`, grouped by
  feature — never in the kit (Philosophy 17: components know nothing about data).
- Group by feature (vertical slices), not by file kind: no `stores/` or `types/` folders.

## Components

- `const Name: React.FC<NameProps> = ({ … }) => { … }` plus `export default Name`.
- Props extend the DOM element's props (`ComponentPropsWithRef<'kbd'>` / `HTMLAttributes`),
  take `ref` as a prop (React 19), forward `className`, `ref` and rest props to the root.
- Variants are string unions; defaults match the spec (e.g. Spinner tone `neutral`).
- English only in code, comments, identifiers and stories.

## Tokens

- `packages/frontend/ui-kit/src/tokens/tokens.css` is the single source of truth. Never edit
  `tokens.generated.ts` / `.scss`; regenerate with `pnpm nx run ui-kit:generate-tokens` and
  commit both. `pnpm run check:tokens` fails when they are out of sync.
- JS reads tokens via `cssVar('name')` (typed `var()`), `token[...]`, and `raw['name']` for
  numbers (px/ms/unitless from the base `:root`) — use `raw` for timings and geometry in JS
  instead of hardcoding 200 / 400 / 16.
- Primitives `--c-*` are excluded from `TokenName` on purpose; components never reference them.
- `pnpm run check:literals` (`tools/check-no-literals.mjs`) fails on hex / px / ms / z-index
  literals in `apps` and `packages/frontend`, except the `tokens` dir, generated files, specs
  and stories. Unitless geometry the spec itself defines (e.g. ring opacity 0.28, "30%" run
  segment) is acceptable with a comment citing the rule.

## Semantic sets and surfaces

- The semantic layer is two sets — LIGHT and DARK — selected by theme (`data-theme` on the root)
  or surface (`data-surface` on a place). Surfaces are relative to the theme: `inverse` is the
  opposite set, `default` resets to the theme's own.
- Every token the DARK set changes must also exist in the LIGHT set (so `default` resets it).
  A token that references another token (`--kbd-bg: var(--bg-raised)`) must be declared in
  **both** sets — `var()` resolves where it is declared. `src/tokens/surfaces.spec.ts` guards this.
- New color roles for a component go into both sets, never as a prop or a JS branch.
- Surfaces paint themselves through `:where([data-surface])` (zero specificity).
- The dark theme is prepared but not enabled: complete the DARK set, then add `[data-theme='dark']`.

## Styling

- CSS Modules (`.module.css` or `.module.scss`). Class selectors only — a type selector in a
  module (`svg { }`) is global.
- Size and density: read `--control-height`, `--row-height`, `--hit-min`, never fix a height
  that the density table owns.
- SVG icons/indicators: `currentColor` for color; tone is a class that sets `color` from a token.

## Timing and async UI

- `useDelayedFlag(active, { delay?, minVisible? })` — defaults `raw['spinner-delay']` /
  `raw['spinner-min']`. Called by the component that owns `busy`; returns whether to draw the
  indicator. `busy` itself drives logic immediately.

## Tests

- Vitest + Testing Library, jsdom. Specs sit next to the code (`*.spec.ts(x)`).
- Timers: `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] })`.
- Stores are module singletons — reset state in `beforeEach`.
- Coverage: `pnpm nx test <project> --coverage`; HTML report in `coverage/<project path>/`.
  Thresholds in each `vite.config.mts` — raise them when coverage grows, never lower silently.
- A test must be able to fail: watch for default parameters that make a "defaults" test pass
  vacuously, or assertions against `undefined` class names.

## Stories

- `@storybook/react-vite`, `Meta<typeof X>` annotation (not `satisfies`).
- Per the acceptance list: every state and value, sizes, a live example, and an
  "on inverse surface" stand (`<Surface tone="inverse">`). Reduced motion can be simulated by
  overriding the duration token on a wrapper.
- Stories use tokens via `cssVar` for their scaffolding; timers in stories are cleaned up.

## CI

- `.github/workflows/design-system.yml` — token sync + literal guard on PRs.
- `.github/workflows/tests.yml` — `pnpm nx run-many -t test --coverage` on PRs, coverage uploaded
  as an artifact.
