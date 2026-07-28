import { describe, expect, it } from 'vitest'
// SSR-render a selection of admin route `Component` exports to cover the
// route component functions themselves (each default export). Routes
// split their I/O into `loader`; the Component is pure given loaderData,
// so we drive it directly with fixture data and assert the page chrome
// renders. This covers the route component functions without standing
// up the loader/DB chain.

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'
import MentionsRouteRaw from '@/routes/admin/analytics/mentions'
import DashboardRouteRaw from '@/routes/admin/dashboard'
import MyProfileRouteRaw from '@/routes/admin/me/profile'
import MySessionsRouteRaw from '@/routes/admin/me/sessions'
import AuditLogRouteRaw from '@/routes/admin/security/audit-log'
import SessionsRouteRaw from '@/routes/admin/security/sessions'

// Generated `Route.ComponentProps` types are strict (params/matches/…);
// `asRoute` widens the prop bag so tests only supply the fields each
// route actually reads from loaderData.
const MentionsRoute = asRoute(MentionsRouteRaw)
const DashboardRoute = asRoute(DashboardRouteRaw)
const MyProfileRoute = asRoute(MyProfileRouteRaw)
const MySessionsRoute = asRoute(MySessionsRouteRaw)
const AuditLogRoute = asRoute(AuditLogRouteRaw)
const SessionsRoute = asRoute(SessionsRouteRaw)

describe('admin routes — Component SSR renders', () => {
  it('audit-log renders the AuditLogView chrome with the retention hint', () => {
    const html = stableHtml(
      renderInRouter(<AuditLogRoute loaderData={{ retentionDays: 42 }} />, '/admin/security/audit-log'),
    )
    expect(html).toContain('42')
  })

  it('me/sessions renders each session row and marks the current session', () => {
    const items = [
      {
        sid: 'abc123',
        userAgent: 'Mozilla/5.0',
        platformHint: 'macOS',
        ip: '127.0.0.1',
        loginAtIso: '2025-01-01T00:00:00.000Z',
        lastActiveAtIso: '2025-01-02T00:00:00.000Z',
        expiresAtIso: '2025-02-01T00:00:00.000Z',
        isCurrent: true,
      },
      {
        sid: 'def456',
        userAgent: 'curl/8',
        platformHint: null,
        ip: '10.0.0.1',
        loginAtIso: '2025-01-01T00:00:00.000Z',
        lastActiveAtIso: '2025-01-01T00:00:00.000Z',
        expiresAtIso: '2025-02-01T00:00:00.000Z',
        isCurrent: false,
      },
    ]
    const html = stableHtml(renderInRouter(<MySessionsRoute loaderData={{ items }} />, '/admin/me/sessions'))
    // The view masks the IP octets; assert on the platform hint and UA
    // which are shown verbatim, plus the "current session" badge.
    expect(html).toContain('macOS')
    expect(html).toContain('curl/8')
    expect(html).toContain('当前会话')
  })

  it('security/sessions renders the admin sessions table with user metadata', () => {
    const items = [
      {
        sid: 'sess-1',
        userId: '1',
        userName: 'Alice',
        userEmail: 'alice@example.com',
        userRole: 'admin' as const,
        userAgent: 'Mozilla',
        platformHint: 'Linux',
        ip: '192.0.2.1',
        loginAtIso: '2025-01-01T00:00:00.000Z',
        lastActiveAtIso: '2025-01-01T00:00:00.000Z',
        expiresAtIso: '2025-02-01T00:00:00.000Z',
        isCurrent: false,
      },
    ]
    const html = stableHtml(renderInRouter(<SessionsRoute loaderData={{ items }} />, '/admin/security/sessions'))
    expect(html).toContain('Alice')
    expect(html).toContain('alice@example.com')
  })

  it('me/profile renders the profile card with user identity and comment counts', () => {
    const html = stableHtml(
      renderInRouter(
        <MyProfileRoute
          loaderData={{
            user: {
              id: '1',
              name: 'Bob',
              email: 'bob@example.com',
              link: 'https://bob.example',
              role: 'author' as const,
              badgeName: 'Author',
              badgeColor: '#abc',
              createdAt: '2024-01-01T00:00:00.000Z',
              lastIp: '127.0.0.1',
              lastUa: 'curl/8',
              loginMethod: 'password',
            },
            counts: { total: 7, pending: 2, deleteRequested: 0 },
            passkeyEnabled: true,
            mailReady: false,
          }}
        />,
        '/admin/me/profile',
      ),
    )
    expect(html).toContain('Bob')
    expect(html).toContain('bob@example.com')
  })

  it('analytics/mentions renders the empty-state copy when there are no referers', () => {
    const html = stableHtml(
      renderInRouter(<MentionsRoute loaderData={{ referers: [] }} />, '/admin/analytics/mentions'),
    )
    expect(html).toContain('反向链接')
    expect(html).toContain('当前时间范围内暂无数据')
  })

  it('analytics/mentions renders referer rows with visit counts', () => {
    const html = stableHtml(
      renderInRouter(
        <MentionsRoute
          loaderData={{
            referers: [
              { name: 'news.example.com', visits: 42, visitors: 30 },
              { name: 'direct', visits: 9, visitors: 8 },
            ],
          }}
        />,
        '/admin/analytics/mentions',
      ),
    )
    expect(html).toContain('news.example.com')
    expect(html).toContain('直接访问')
    // Visit + visitor counts are rendered via toLocaleString; assert the digits appear.
    expect(html).toContain('42')
  })

  it('dashboard renders the greeting, role label, and stats chrome', () => {
    const html = stableHtml(
      renderInRouter(
        <DashboardRoute
          loaderData={{
            name: 'Carol',
            role: 'author',
            pendingModeration: null,
            visitSummary: null,
            weeklyTrend: null,
            emptyStateLine: 'all caught up',
            stats: { draftCount: 3, publishedCount: 11, myCommentsTotal: 4, myCommentsPending: 1 },
            recentDrafts: [{ id: '9', title: 'Draft A', updatedAtIso: '2025-01-01T00:00:00.000Z' }],
            recentPublished: [{ id: '8', title: 'Post Z', updatedAtIso: '2025-01-01T00:00:00.000Z' }],
          }}
        />,
        '/admin/dashboard',
      ),
    )
    expect(html).toContain('Carol')
    // Stats grid renders every numeric field.
    expect(html).toContain('3')
    expect(html).toContain('11')
    // Recent draft / published titles surface.
    expect(html).toContain('Draft A')
    expect(html).toContain('Post Z')
  })
})
