import { describe, expect, it, vi } from 'vitest'

import type { MySessionItem } from '@/routes/admin/me/sessions'
import type { MyProfileUser, MyProfileCounts } from '@/ui/admin/my/MyProfileView'

import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { MyProfileView } from '@/ui/admin/my/MyProfileView'
import { MySessionsView } from '@/ui/admin/my/MySessionsView'
import { PasskeyManagementCard } from '@/ui/admin/my/PasskeyManagementCard'
import { PasswordChangeForm } from '@/ui/admin/my/PasswordChangeForm'

vi.mock('@/ui/admin/auth/AdminCredentialsForm', () => ({
  useWebAuthnSupported: () => true,
}))

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

function makeMyProfileUser(overrides: Partial<MyProfileUser> = {}): MyProfileUser {
  return {
    id: overrides.id ?? 'user-1',
    name: overrides.name ?? 'Alice',
    email: overrides.email ?? 'alice@example.com',
    link: overrides.link ?? '',
    role: overrides.role ?? 'admin',
    badgeName: overrides.badgeName ?? '',
    badgeColor: overrides.badgeColor ?? '#008c95',
    createdAt: overrides.createdAt ?? '2024-01-01T00:00:00.000Z',
    lastIp: overrides.lastIp ?? '127.0.0.1',
    lastUa: overrides.lastUa ?? 'Mozilla/5.0',
    passkeyForce: overrides.passkeyForce ?? false,
  }
}

function makeCounts(overrides: Partial<MyProfileCounts> = {}): MyProfileCounts {
  return {
    total: overrides.total ?? 10,
    pending: overrides.pending ?? 2,
    deleteRequested: overrides.deleteRequested ?? 1,
  }
}

function makeSession(overrides: Partial<MySessionItem> = {}): MySessionItem {
  return {
    sid: overrides.sid ?? 'session-1',
    userAgent: overrides.userAgent ?? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    platformHint: overrides.platformHint ?? 'macOS',
    ip: overrides.ip ?? '127.0.0.1',
    loginAtIso: overrides.loginAtIso ?? '2024-01-01T00:00:00.000Z',
    lastActiveAtIso: overrides.lastActiveAtIso ?? '2024-01-02T00:00:00.000Z',
    expiresAtIso: overrides.expiresAtIso ?? '2024-01-03T00:00:00.000Z',
    isCurrent: overrides.isCurrent ?? true,
  }
}

describe('snapshot: MyProfileView', () => {
  it('renders profile and stats for admin', () => {
    const html = stableHtml(
      renderInRouter(<MyProfileView user={makeMyProfileUser()} counts={makeCounts()} passkeyEnabled={false} />),
    )
    expect(html).toContain('个人信息')
    expect(html).toContain('Alice')
    expect(html).toContain('alice@example.com')
    expect(html).toContain('管理员')
    expect(html).toContain('评论总数')
    expect(html).toContain('修改密码')
  })

  it('renders badge fields for privileged role', () => {
    const html = stableHtml(
      renderInRouter(
        <MyProfileView user={makeMyProfileUser({ role: 'author' })} counts={makeCounts()} passkeyEnabled={false} />,
      ),
    )
    expect(html).toContain('徽章名称')
    expect(html).toContain('徽章颜色')
  })

  it('hides badge fields for visitor', () => {
    const html = stableHtml(
      renderInRouter(
        <MyProfileView user={makeMyProfileUser({ role: 'visitor' })} counts={makeCounts()} passkeyEnabled={false} />,
      ),
    )
    expect(html).not.toContain('徽章名称')
  })
})

describe('snapshot: MySessionsView', () => {
  it('renders session list', () => {
    const items = [makeSession(), makeSession({ sid: 'session-2', isCurrent: false })]
    const html = stableHtml(renderInRouter(<MySessionsView items={items} />))
    expect(html).toContain('登录设备')
    expect(html).toContain('当前会话')
    expect(html).toContain('注销')
  })

  it('renders empty state', () => {
    const html = stableHtml(renderInRouter(<MySessionsView items={[]} />))
    expect(html).toContain('暂无登录设备')
  })
})

describe('snapshot: PasswordChangeForm', () => {
  it('renders password fields', () => {
    const html = stableHtml(renderToHtml(<PasswordChangeForm />))
    expect(html).toContain('原密码')
    expect(html).toContain('新密码')
    expect(html).toContain('修改密码')
  })
})

describe('snapshot: PasskeyManagementCard', () => {
  it('renders loading state when passkey is enabled', () => {
    const html = stableHtml(
      renderInRouter(<PasskeyManagementCard userId="user-1" passkeyForce={false} passkeyEnabled={true} />),
    )
    expect(html).toContain('Passkey 管理')
    expect(html).toContain('加载中')
    expect(html).toContain('添加新设备')
    expect(html).toContain('强制使用 Passkey 登录')
  })
})
