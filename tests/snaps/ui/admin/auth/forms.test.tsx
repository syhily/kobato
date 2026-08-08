import { describe, expect, it, vi } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { AdminInstallForm } from '@/ui/admin/auth/AdminInstallForm'

// AdminInstallForm's mode is clicked-in (event-gated), unreachable in one
// SSR pass — auth-forms.test.tsx covers install mode; this adds the full
// field set + the submitting copy driven by a mocked useNavigation.

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

// Hoisted useNavigation singleton so each test flips state/formMethod.
const navigationState = vi.hoisted(() => ({ state: 'idle', formMethod: 'GET' }))
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useNavigation: () => navigationState,
    useRouteLoaderData: () => ({ csrfToken: 'test-csrf-token' }),
  }
})

// extractApiErrorMessage / isApiAccepted stay real (SSR-safe pure helpers).

describe('snapshot: AdminInstallForm (install form fields)', () => {
  it('renders the install form with title / name / email / password fields and a CSRF hidden input', () => {
    navigationState.state = 'idle'
    navigationState.formMethod = 'GET'
    const html = stableHtml(renderInRouter(<AdminInstallForm />, '/setup'))
    expect(html).toContain('id="adminInstallForm"')
    expect(html).toContain('name="intent"')
    expect(html).toContain('value="install"')
    expect(html).toContain('name="csrf_token"')
    expect(html).toContain('value="test-csrf-token"')
    expect(html).toContain('站点名称')
    expect(html).toContain('id="install-title"')
    expect(html).toContain('name="title"')
    expect(html).toContain('昵称')
    expect(html).toContain('id="install-name"')
    expect(html).toContain('name="name"')
    expect(html).toContain('邮箱')
    expect(html).toContain('id="install-email"')
    expect(html).toContain('name="email"')
    expect(html).toContain('密码')
    expect(html).toContain('id="install-password"')
    expect(html).toContain('name="password"')
    expect(html).toContain('minLength="10"')
    // Default showPassword=false → "显示密码" aria label.
    expect(html).toContain('aria-label="显示密码"')
    expect(html).toContain('创建账号并开始写作')
    // Restore-mode copy absent (mode defaults to install).
    expect(html).not.toContain('备份文件')
    expect(html).not.toContain('恢复说明')
  })

  it('renders the 创建中… submit copy and disables inputs while submitting', () => {
    navigationState.state = 'submitting'
    navigationState.formMethod = 'POST'
    const html = stableHtml(renderInRouter(<AdminInstallForm />, '/setup'))
    expect(html).toContain('创建中...')
    expect(html).toContain('disabled=""')
    expect(html).toContain('id="install-title"')
    expect(html).toContain('disabled=""')
  })
})
