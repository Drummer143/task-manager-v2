# Performance and responsiveness

The primary lens. "Responsive" is not an impression but a set of thresholds (Philosophy 03).
A missed threshold is either fixed or the way of showing the wait changes — never left as is.

## Budgets (Philosophy 03)

| Class | Threshold | Must fit | If it does not |
|---|---|---|---|
| Instant | ≤ 16 ms | hover, focus, press, typing a character, checkbox, opening a menu | render bug — move work out of the handler |
| Soft | ≤ 100 ms | switching view, sort, filter, drag highlight, opening the task panel | optimistic frame + background load |
| Noticeable | ≤ 300 ms | page-tree navigation, first board screen | structure skeleton, not a spinner |
| Long | ≥ 300 ms | attachments, heavy search, export | progress with percent, user can leave the screen |

Review question for every interaction in the diff: which class is it, and what in the code
could push it over?

## Re-render scope

The most common way to break the 16 ms budget in this codebase.

- **Store subscriptions must be narrow.** With zustand, select the smallest value a component
  needs, ideally a boolean derived per item:
  ```ts
  // bad — every card re-renders when the cursor moves
  const cursor = useCursorStore((s) => s.cursor);
  // good — only the two cards whose answer changed re-render
  const active = useCursorStore((s) => s.cursor === task.id);
  ```
  Selecting the whole store (`useStore()` / `useStore((s) => s)`) or returning a fresh object
  or array from a selector without `useShallow` re-renders on every store change — flag it.
- **Context for fast-changing values is a finding.** A context whose value changes per
  keystroke / per J-K step re-renders every consumer. Context is fine for rarely changing values
  (surface tone, theme, density).
- **Unstable context values.** `value={{ a, b }}` created inline re-renders all consumers on
  every parent render. Memoize, or split contexts.
- **Unstable props into memoized or effect-dependent code.** Inline objects/callbacks passed to
  a `memo` component, or into a hook that lists them as effect deps (`useRegisterHotkey(config)`,
  `useEscapeStack(handler)` — both document "memoize or it re-registers every render"), cause
  re-registration churn. Check the call sites, not just the hook.
- **Do not demand blanket `useMemo` / `useCallback`.** Only where identity matters (deps,
  `memo` children, context values) or the computation is measurably heavy.

## Work per frame and per event

- **Handlers stay light.** No sorting / filtering of big lists, no synchronous JSON of large
  objects, no layout reads in a keydown or pointermove handler. Derive in render with
  `useMemo`, or defer.
- **Layout thrash.** Reading layout (`getBoundingClientRect`, `offsetWidth`, `scrollTop`) after
  writing styles in the same tick, especially in a loop or in `pointermove`. Batch reads, then
  writes; prefer `requestAnimationFrame` for drag.
- **Global listeners are singletons.** One `keydown` listener for hotkeys, one for Esc (see
  `useListenEscape`'s ref count). A component adding its own `window` listener per instance
  (per card, per row) is a finding.
- **Never wait for the network to show input** (Philosophy 03 rule 1). Local state is the source
  of truth for the frame.

## Lists

- **Virtualize from the first row past ~50 nodes** (Philosophy 03 rule 4). `react-virtuoso` is
  the chosen library. A `.map` over an unbounded server list without virtualization is a
  blocker on board columns, tables and the page tree.
- **Row height is known before data** (rule 5): fixed or estimated heights from tokens
  (`--row-height`, card layout), so the list does not jump when data arrives.
- **Keys are stable ids.** Index keys in reorderable or filterable lists (board columns,
  tables, drag and drop) break state and animations.
- **Realtime updates do not reorder under the cursor** (Philosophy 14): the new position
  applies when the cursor leaves the item.

## Waiting indicators (Philosophy 03, 11; Primitives 02)

- **No spinner in the first 200 ms**, and once shown it stays ≥ 400 ms. Use `useDelayedFlag`
  (defaults come from `--spinner-delay` / `--spinner-min`); it must be called by the owner of
  `busy`, because `{busy && <Spinner />}` unmounts instantly and cannot honor the minimum.
- **`busy` drives logic immediately** (ignore repeated clicks, `aria-busy`); the delayed flag
  only drives the picture.
- **One indicator per request.** A global overlay loader is allowed only on app start.
- **> 1 s in an area → skeleton or Progress under the header**, never a centered spinner on
  an empty screen. **> 10 s → "still running" text and a way to cancel.**
- **Background refetch keeps old data on screen** with a thin progress line; replacing content
  with a skeleton or resetting scroll on refetch is a finding.
- **Cache is part of UX**: returning to a visited screen shows cached data at once and
  revalidates quietly (stale-while-revalidate).

## Motion cost (Philosophy 12; Primitives 00)

- **Animate only `transform` and `opacity`.** Animating `width`, `height`, `top/left`, `margin`,
  list height or `stroke-dashoffset` triggers layout or paint every frame — blocker in hot paths.
  Determinate progress is `transform: scaleX()`, not `width`.
- **Primitive state transitions: color and opacity only**, `--dur-state` (90 ms). The single
  exception is the Switch thumb (`transform`).
- **Durations come from tokens** (`--dur-state`, `--dur-layer`, `--dur-panel`, `--dur-move`,
  `--dur-exit`, `--spin-duration`). Exit is always faster than enter.
- **Animation never delays an action**: a click / menu selection acts in the same frame, not
  after the transition ends. New actions interrupt running animations from their current position.
- **Reduced motion is handled by the token layer** (durations change under the media query);
  components should not each add their own `@media (prefers-reduced-motion)` unless the kind
  of motion changes (e.g. indeterminate progress switching from running to breathing).
  Rotation slows (1600 ms) rather than stopping — a still spinner looks frozen.
- **`will-change`** only on elements that are about to animate, never as a blanket rule.

## Effects, timers, subscriptions

- Every `setTimeout` / `setInterval` / listener / subscription created in an effect is cleared
  in its cleanup, including when the input flips back before the timer fires. Missing cleanup
  is the classic source of "the spinner stays forever" (a pending show-timer firing after the
  work already ended).
- Refs that carry state across effect runs are reset when the cycle ends.
- `setState` after unmount (async callbacks, stories with timers) — flag missing guards/cleanup.
- StrictMode runs effects twice in development: effect logic must be idempotent with cleanup.

## Rendering cost in CSS

- SVG: `vector-effect: non-scaling-stroke` also moves the dash pattern into screen space —
  dashes repeat on large sizes. Prefer a `viewBox` in real pixels plus `pathLength`.
- Specificity games (`!important`, deep selectors) usually hide an ordering bug; the kit uses
  `:where()` for zero-specificity defaults.
- Type selectors in CSS Modules (`svg { … }`, `div { … }`) are global — they affect the whole
  page, not the component.
- Images and previews reserve their box before loading (no layout jump; Philosophy 11).

## Bundle

- No styled UI libraries — review rejection, not a compromise (Philosophy 17). Only headless
  behavior primitives are allowed.
- Watch for heavy imports in the kit's hot path (date libraries, lodash as a whole, icon packs
  imported wholesale).
