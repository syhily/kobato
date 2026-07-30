// Canonical `@tanstack/react-query` module mock for UI tests.
//
// The convention (see tests/AGENTS.md): setup stubs the noise, `_helpers`
// owns the doubles. A test file that only needs inert query/mutation hooks
// calls `mockTanstackQuery()` once at module scope and mutates the returned
// control singleton per test instead of hand-rolling a `vi.hoisted` +
// `vi.mock('@tanstack/react-query', …)` pair:
//
//   const queryMocks = mockTanstackQuery()
//
//   beforeEach(() => {
//     queryMocks.infinite = { data: { pages: [] }, isLoading: true, … }
//   })
//
// IMPORTANT: import this helper BEFORE any import that transitively pulls in
// `@tanstack/react-query` (i.e. before the component-under-test imports) so
// the module mock is registered before those modules evaluate.
//
// The mock spreads the real module (providers, QueryClient, error classes
// stay real) and replaces only the five hook seams the admin/public views
// consume. The hook bodies read the control slots lazily on every render, so
// rebinding a slot (`queryMocks.query = …`) takes effect on the next render.
// Files that need behavioural mocks (call-order routing, option capture,
// `initialData` pass-through) keep their own bespoke `vi.mock` instead.

import { vi } from 'vitest'

/**
 * Mutable control surface returned by {@link mockTanstackQuery}. The four
 * slots mirror the hook results; tests rebind them wholesale per case with
 * whatever subset of the real hook result the component under test reads
 * (tests/AGENTS.md permits relaxed typing for mock control surfaces — the
 * slots are deliberately `any`, and the index signature lets a file park
 * extra per-file state on the same singleton).
 */
export interface TanstackQueryControl {
  query: any
  mutation: any
  infinite: any
  queryClient: any
  [slot: string]: any
}

// Per-test-file singleton: Vitest isolates module graphs per test file, so
// each importing suite gets its own control object (and its own vi.fn()s).
const control: TanstackQueryControl = {
  query: {
    data: null as unknown,
    isLoading: false,
    isPending: false,
    isFetching: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  mutation: {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
  },
  infinite: {
    data: { pages: [] as unknown[] },
    isLoading: false,
    isPending: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    error: null as unknown,
    fetchNextPage: vi.fn(),
  },
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    removeQueries: vi.fn(),
    cancelQueries: vi.fn(),
  },
}

// The module mock registration. Vitest hoists `vi.mock` calls to the top of
// the module regardless of nesting, so this lives at module scope: importing
// this helper registers the mock (before the importing test file's component
// imports evaluate, as long as this helper is imported first), and
// `mockTanstackQuery()` only hands out the control singleton.
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: () => control.query,
    useQueries: ({ queries }: { queries: unknown[] }) => queries.map(() => control.query),
    useMutation: () => control.mutation,
    useInfiniteQuery: () => control.infinite,
    useQueryClient: () => control.queryClient,
  }
})

/**
 * Returns the hoisted control singleton the mocked hooks read from. Call it
 * once at module scope and rebind its slots per test.
 */
export function mockTanstackQuery(): TanstackQueryControl {
  return control
}
