// Canonical @tanstack/react-query mock. Import before any module that
// transitively pulls in react-query, call once at module scope, rebind
// slots per test. Behavioural mocks keep their own vi.mock.

import { vi } from 'vitest'

/** Mutable control surface: the slots mirror the hook results; tests rebind them per case. */
export interface TanstackQueryControl {
  query: any
  mutation: any
  infinite: any
  queryClient: any
  [slot: string]: any
}

// Per-test-file singleton — Vitest isolates module graphs per file.
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

// Vitest hoists vi.mock to module top, so importing this helper installs the mock.
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

/** Returns the hoisted control singleton the mocked hooks read from. */
export function mockTanstackQuery(): TanstackQueryControl {
  return control
}
