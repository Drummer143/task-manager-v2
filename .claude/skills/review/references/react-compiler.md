# React Compiler

React Compiler 1.0 runs in both `apps/frontend` and `packages/frontend/ui-kit` (Babel route:
`@rolldown/plugin-babel` + `reactCompilerPreset()` in each `vite.config.mts`). Tests and stories
run compiled code too. Lint (`eslint-plugin-react-hooks` 7, `recommended`) is the compiler's own
diagnostics.

The compiler memoizes every value and JSX element of a component or hook by its inputs. When a
function breaks the rules of React or uses syntax it cannot lower, it **skips that function
silently**: the build passes, the component works, and it is simply not optimized. So the review
question is not "is it memoized by hand" but "will the compiler take it".

## Findings that cost the compiler (major in hot paths: rows, cells, cards, the tree)

- **Any `react-hooks/*` lint error** — the function is not compiled. Run `pnpm nx run-many -t lint`
  on the affected projects; an error is a finding by itself.
- **`eslint-disable` for `react-hooks/exhaustive-deps` or `react-hooks/rules-of-hooks`** — the
  compiler skips the whole component, even if the effect itself is right. The fix is
  `useEffectEvent` for "run on X, read the latest Y":
  ```tsx
  const onOpen = useEffectEvent(() => track(view, filters));
  useEffect(() => onOpen(), [taskId]);
  ```
  Disabling other rules (`set-state-in-effect`, `refs`) does not skip compilation, but needs a
  comment saying why the rule does not apply.
- **`ref.current` read or written during render**, including the "latest value" pattern
  `latest.current = props.x` in the body. Write it in `useLayoutEffect`, use `useEffectEvent`, or
  keep the value in state.
- **A previous value kept in a ref** to compare during render. Use state, adjusted during render:
  ```tsx
  const [prev, setPrev] = useState(value);
  if (prev !== value) { setPrev(value); /* react to the change */ }
  ```
- **Writes outside the component during render**: module variables (`warned = true`), globals.
  Move them to an effect.
- **Impure calls in render**: `Date.now()`, `Math.random()`, `crypto.randomUUID()`,
  `performance.now()`. Their value is cached and freezes. Use `useState(() => …)` or an effect.
- **A hook used as a value**, or a hook that differs between renders (`router.useHref`).
- **A whole object holding a ref read in render** (`drag.drag` where `drag` also carries
  `ghostRef`): the compiler treats the object as a ref. Destructure the hook's result.

## Syntax the compiler 1.0 cannot lower (it skips the function, lint is silent)

`??=` / `||=` / `&&=` · `for (;;)` and `for` without a test · `throw` inside `try` · `x++` on a
module variable · `cx(a && b) || c` inline (hoist the call, keep `|| c` outside). Flag these in
components and hooks on hot paths; one-off screens (auth callback) and mount-once hooks may keep
them.

To check a file: React DevTools shows **Memo ✨** on compiled components; the playground
(playground.react.dev) shows why a function is skipped.

## Stale data from outside React

The compiler caches an expression until its React-visible inputs change. Reading mutable state
in render returns a stale value:

```tsx
const cursor = useCursorStore.getState().cursor; // ❌ in render: may freeze
const cursor = useCursorStore((s) => s.cursor);  // ✅ a subscription
```

`getState()`, `window.*`, `document.*`, `localStorage` are fine in handlers, effects and
callbacks — flag them only in the render body.

## Manual memoization

- **Do not ask for `useMemo` / `useCallback` / `memo`.** The compiler covers them, with finer
  granularity. Inline objects and arrows in JSX are fine.
- Existing manual memoization may stay; the compiler validates it (`preserve-manual-memoization`).
  Removing it is not a finding either way.
- **Memoization is not a correctness guarantee.** Code whose behavior depends on an object
  staying the same (an effect that must not re-run, a registry key) needs state, a ref written
  in an effect, or `useEffectEvent` — not a memo. Flag correctness built on memo identity.
- **Narrow store selectors still matter** — the compiler does not stop a subscription from
  re-rendering. So does splitting fast-changing context.

## Incompatible libraries

Libraries that return mutable functions or objects (TanStack Virtual / Table, `react-hook-form`'s
`watch`) get a `react-hooks/incompatible-library` warning and leave the component uncompiled.
Keep such use inside one kit wrapper (`VirtualList`) with hand-made memoization; do not spread
the library into product components.

## Known, accepted skips (do not flag)

`VirtualList` (TanStack Virtual), `Surface` (`composeRefs` with the child's `ref`),
`useLinkClick` (the router adapter's `useHref`), `CallbackScreen`, `Root`, `useListenEscape`,
`useListenHotkey`.
