import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminUserDto } from '@/shared/types/users'
import type { RoleFilter, SortOrder } from '@/ui/admin/users/useUsersController'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { UsersView } from '@/ui/admin/users/UsersView'

// `UsersView` is driven by `useUsersController` + three TanStack Query hooks
// (list + query client + mutations are never fired in SSR). The existing
// `users.test.tsx` only snapshots the loading chrome; this suite covers the
// remaining render-path branches:
//   - populated rows via `state.rows.map`,
//   - empty state,
//   - loading skeleton,
//   - error toast path (render still completes),
//   - active search value in the input,
//   - `hasMore` sentinel vs end-of-list sentinel.

// ───────────────────────── controller mock ──────────────────────────

interface ControllerState {
  rows: AdminUserDto[]
  total: number
  hasMore: boolean
  pageSize: number
  q: string
  role: RoleFilter
  sortBy: SortOrder
  includeDeleted: boolean
}

const controllerState = vi.hoisted((): { state: ControllerState } => ({
  state: {
    rows: [] as AdminUserDto[],
    total: 0,
    hasMore: false,
    pageSize: 20,
    q: '',
    role: 'all' as RoleFilter,
    sortBy: 'recent' as SortOrder,
    includeDeleted: false,
  },
}))

vi.mock('@/ui/admin/users/useUsersController', () => ({
  useUsersController: () => ({
    state: controllerState.state,
    dispatch: vi.fn(),
  }),
}))

// ─────────────────────── react-query mock ───────────────────────────

const queryMocks = vi.hoisted(() => ({
  query: {
    data: null as {
      users: AdminUserDto[]
      total: number
      hasMore: boolean
    } | null,
    isPending: true,
    isFetching: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  mutation: {
    mutate: vi.fn(),
    isPending: false,
  },
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: () => queryMocks.query,
    useMutation: () => queryMocks.mutation,
    useQueryClient: () => queryMocks.queryClient,
  }
})

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

vi.mock('@/ui/admin/shared/useDebouncedSearch', () => ({
  useDebouncedSearch: () => [debouncedSearch.value, debouncedSearch.setInput],
}))

const debouncedSearch = vi.hoisted(() => ({ value: '', setInput: vi.fn() }))

vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

// ───────────────────────────── fixtures ─────────────────────────────

function makeAdminUser(overrides: Partial<AdminUserDto> = {}): AdminUserDto {
  const id = overrides.id ?? `user-${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    name: overrides.name ?? 'User',
    email: overrides.email ?? `${id}@example.com`,
    link: overrides.link ?? null,
    badgeName: overrides.badgeName ?? null,
    badgeColor: overrides.badgeColor ?? null,
    badgeTextColor: overrides.badgeTextColor ?? null,
    role: overrides.role ?? 'author',
    isMuted: overrides.isMuted ?? false,
    emailVerified: overrides.emailVerified ?? true,
    createdAt: overrides.createdAt ?? '2024-01-01T00:00:00.000Z',
    deletedAt: overrides.deletedAt ?? null,
    commentCount: overrides.commentCount ?? 0,
    pendingCount: overrides.pendingCount ?? 0,
    lastCommentAt: overrides.lastCommentAt ?? null,
    passkeyCount: overrides.passkeyCount ?? 0,
    passkeyForce: overrides.passkeyForce ?? false,
  }
}

function setState(overrides: Partial<ControllerState> = {}): void {
  controllerState.state = { ...controllerState.state, ...overrides }
}

function renderUsers(): string {
  return stableHtml(renderInRouter(<UsersView />, '/admin/security/users'))
}

// ─────────────────────────── shared setup ───────────────────────────

describe('snapshot: UsersView branches', () => {
  beforeEach(() => {
    controllerState.state = {
      rows: [],
      total: 0,
      hasMore: false,
      pageSize: 20,
      q: '',
      role: 'all',
      sortBy: 'recent',
      includeDeleted: false,
    }
    queryMocks.query = {
      data: null,
      isPending: true,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
    queryMocks.mutation = { mutate: vi.fn(), isPending: false }
    debouncedSearch.value = ''
    debouncedSearch.setInput = vi.fn()
  })

  it('renders populated rows via the state.rows.map callback', () => {
    const a = makeAdminUser({ id: 'user-1', name: 'Alice', role: 'admin' })
    const b = makeAdminUser({
      id: 'user-2',
      name: 'Bob',
      role: 'visitor',
      isMuted: true,
    })
    setState({ rows: [a, b], total: 2, hasMore: false })
    queryMocks.query = {
      ...queryMocks.query,
      isPending: false,
      data: { users: [a, b], total: 2, hasMore: false },
    }

    const html = renderUsers()
    expect(html).toContain('用户管理')
    expect(html).toContain('Alice')
    expect(html).toContain('Bob')
    expect(html).toContain('管理员')
    expect(html).toContain('访客')
    expect(html).toContain('已禁言')
    expect(html).toContain('/admin/security/users/user-1')
    expect(html).toContain('已加载全部用户')
  })

  it('renders the empty-state branch once the list resolves without rows', () => {
    queryMocks.query = {
      ...queryMocks.query,
      isPending: false,
      data: { users: [], total: 0, hasMore: false },
    }
    const html = renderUsers()
    expect(html).toContain('用户管理')
    expect(html).toContain('未找到用户')
    expect(html).not.toContain('已加载全部用户')
  })

  it('renders the loading skeleton while the first page is pending', () => {
    queryMocks.query = { ...queryMocks.query, isPending: true, data: null }
    const html = renderUsers()
    expect(html).toContain('用户管理')
    expect(html).toContain('skeleton')
    expect(html).not.toContain('未找到用户')
  })

  it('still renders the chrome when the list query errors (toast path)', () => {
    queryMocks.query = {
      ...queryMocks.query,
      isPending: false,
      error: new Error('lookup failed'),
      data: null,
    }
    const html = renderUsers()
    expect(html).toContain('用户管理')
    expect(html).toContain('未找到用户')
  })

  it('reflects the active search term in the search input value', () => {
    debouncedSearch.value = '关键词'
    queryMocks.query = {
      ...queryMocks.query,
      isPending: false,
      data: { users: [], total: 0, hasMore: false },
    }
    const html = renderUsers()
    expect(html).toContain('value="关键词"')
    expect(html).toContain('搜索用户名或邮箱')
  })

  it('renders the load-more sentinel when hasMore is true', () => {
    const a = makeAdminUser({ id: 'user-3', name: 'Carol' })
    setState({ rows: [a], total: 50, hasMore: true })
    queryMocks.query = {
      ...queryMocks.query,
      isPending: false,
      data: { users: [a], total: 50, hasMore: true },
    }
    const html = renderUsers()
    expect(html).toContain('Carol')
    expect(html).toContain('class="h-1"')
    expect(html).not.toContain('已加载全部用户')
  })

  it('marks the toolbar filter button active when a role filter is applied', () => {
    setState({ role: 'admin', includeDeleted: true })
    queryMocks.query = {
      ...queryMocks.query,
      isPending: false,
      data: { users: [], total: 0, hasMore: false },
    }
    const html = renderUsers()
    expect(html).toContain('筛选')
    expect(html).toContain('border-foreground/30')
    expect(html).toContain('bg-secondary')
  })
})
