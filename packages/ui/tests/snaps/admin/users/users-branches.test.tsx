import type { AdminUserDto } from '@kobato/shared/contracts/users'
import type { UsersFilters } from '@kobato/ui/admin/users/useUsersFilters'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, stableHtml } from '#/_helpers/render'

import { UsersView } from '@kobato/ui/admin/users/UsersView'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `UsersView` drives its rows from `useInfiniteQuery` (server state lives in
// the TanStack cache) and its filters from `useUsersFilters`. To maximise
// render-path branch coverage we bypass both: a hoisted filters singleton
// each test can flip, and a hoisted slot for the infinite list query. The
// existing `users.test.tsx` only snapshots the loading chrome; this suite
// covers the remaining render-path branches:
//   - populated rows via `rows.map`,
//   - empty state,
//   - loading skeleton,
//   - error toast path (render still completes),
//   - active search value in the input,
//   - `hasNextPage` sentinel vs end-of-list sentinel.

// ───────────────────────── controller mock ──────────────────────────

const controller = vi.hoisted((): { filters: UsersFilters } => ({
  filters: {
    q: '',
    role: 'all',
    sortBy: 'recent',
    pageSize: 20,
    includeDeleted: false,
  },
}))

vi.mock('@kobato/ui/admin/users/useUsersFilters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kobato/ui/admin/users/useUsersFilters')>()
  return {
    ...actual,
    useUsersFilters: () => ({
      filters: controller.filters,
      setQ: vi.fn(),
      setRole: vi.fn(),
      setSortBy: vi.fn(),
      setPageSize: vi.fn(),
      setIncludeDeleted: vi.fn(),
    }),
  }
})

const queryMocks = mockTanstackQuery()

queryMocks.infinite = {
  data: undefined as { pages: { users: AdminUserDto[]; total: number; hasMore: boolean }[] } | undefined,
  isLoading: true,
  error: null as Error | null,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
}

// `useDebouncedSearch` is driven (one test types a keyword), so it keeps a
// file-level stub instead of relying on the real hook's SSR default.
vi.mock('@kobato/ui/admin/shared/useDebouncedSearch', () => ({
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
    loginMethod: overrides.loginMethod ?? 'password',
  }
}

function setFilters(overrides: Partial<UsersFilters> = {}): void {
  controller.filters = { ...controller.filters, ...overrides }
}

function setList(users: AdminUserDto[], total = users.length): void {
  queryMocks.infinite.data = { pages: [{ users, total, hasMore: false }] }
  queryMocks.infinite.isLoading = false
  queryMocks.infinite.error = null
}

function renderUsers(): string {
  return stableHtml(renderInRouter(<UsersView />, '/admin/security/users'))
}

// ─────────────────────────── shared setup ───────────────────────────

describe('snapshot: UsersView branches', () => {
  beforeEach(() => {
    controller.filters = {
      q: '',
      role: 'all',
      sortBy: 'recent',
      pageSize: 20,
      includeDeleted: false,
    }
    queryMocks.infinite.data = undefined
    queryMocks.infinite.isLoading = true
    queryMocks.infinite.error = null
    queryMocks.infinite.hasNextPage = false
    queryMocks.infinite.isFetchingNextPage = false
    queryMocks.mutation = { mutate: vi.fn(), isPending: false }
    debouncedSearch.value = ''
    debouncedSearch.setInput = vi.fn()
  })

  it('renders populated rows via the rows.map callback', () => {
    const a = makeAdminUser({ id: 'user-1', name: 'Alice', role: 'admin' })
    const b = makeAdminUser({
      id: 'user-2',
      name: 'Bob',
      role: 'visitor',
      isMuted: true,
    })
    setList([a, b], 2)

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
    setList([])
    const html = renderUsers()
    expect(html).toContain('用户管理')
    expect(html).toContain('未找到用户')
    expect(html).not.toContain('已加载全部用户')
  })

  it('renders the loading skeleton while the first page is pending', () => {
    const html = renderUsers()
    expect(html).toContain('用户管理')
    expect(html).toContain('skeleton')
    expect(html).not.toContain('未找到用户')
  })

  it('still renders the chrome when the list query errors (toast path)', () => {
    queryMocks.infinite.isLoading = false
    queryMocks.infinite.error = new Error('lookup failed')
    queryMocks.infinite.data = undefined
    const html = renderUsers()
    expect(html).toContain('用户管理')
    expect(html).toContain('未找到用户')
  })

  it('reflects the active search term in the search input value', () => {
    debouncedSearch.value = '关键词'
    setList([])
    const html = renderUsers()
    expect(html).toContain('value="关键词"')
    expect(html).toContain('搜索用户名或邮箱')
  })

  it('renders the load-more sentinel when hasNextPage is true', () => {
    const a = makeAdminUser({ id: 'user-3', name: 'Carol' })
    setList([a], 50)
    queryMocks.infinite.hasNextPage = true
    const html = renderUsers()
    expect(html).toContain('Carol')
    expect(html).toContain('class="h-1"')
    expect(html).not.toContain('已加载全部用户')
  })

  it('marks the toolbar filter button active when a role filter is applied', () => {
    setFilters({ role: 'admin', includeDeleted: true })
    setList([])
    const html = renderUsers()
    expect(html).toContain('筛选')
    expect(html).toContain('border-foreground/30')
    expect(html).toContain('bg-secondary')
  })
})
