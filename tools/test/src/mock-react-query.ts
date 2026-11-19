import { vi } from 'vitest'

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
    isError: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    hasNextPage: false,
    error: null as unknown,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
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

export function mockTanstackQuery(): TanstackQueryControl {
  return control
}
