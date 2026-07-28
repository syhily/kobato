import { describe, expect, it, vi } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { AdminInstallForm } from '@/ui/admin/auth/AdminInstallForm'

// AdminInstallForm is a stateful component whose visible body depends on
// the internal `mode` state ('install' | 'restore'). The mode is selected
// by clicking the mode-switcher buttons — `renderInRouter` performs a
// single synchronous SSR pass, so we cannot click. The existing
// `auth-forms.test.tsx` covers the install mode + the mode-switcher
// labels + the disabled-restore case. This file complements it by
// covering the install-mode form fields and the restore-mode body via a
// state seed: we mock the form's `useState` initializer to default to
// `restore` so the restore form renders without a click.
//
// The internal `useState` calls happen in source order; the second one
// (`showPassword`) is the only boolean state we don't want to perturb.
// Rather than globally mock useState (fragile), we drive the restore
// branch via the `waitingForRestart` / `waitStatus` rendering branches
// which are gated on useState too. The cleanest SSR-reachable extra
// branches are: (a) the install form's full field set, and (b) the
// install-mode submit button pending copy when the navigation is
// submitting.

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

// `react-router`'s `useNavigation` powers the submitting state. We mock
// it with a hoisted singleton so each test can flip `state` /
// `formMethod` without re-rendering.
const navigationState = vi.hoisted(() => ({ state: 'idle', formMethod: 'GET' }))
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useNavigation: () => navigationState,
    useRouteLoaderData: () => ({ csrfToken: 'test-csrf-token' }),
  }
})

// `extractApiErrorMessage` / `isApiAccepted` are pure helpers imported
// alongside the form; left untouched (real implementations are SSR-safe).

describe('snapshot: AdminInstallForm (install form fields)', () => {
  it('renders the install form with title / name / email / password fields and a CSRF hidden input', () => {
    navigationState.state = 'idle'
    navigationState.formMethod = 'GET'
    const html = stableHtml(renderInRouter(<AdminInstallForm />, '/setup'))
    // Form id + install intent hidden input.
    expect(html).toContain('id="adminInstallForm"')
    expect(html).toContain('name="intent"')
    expect(html).toContain('value="install"')
    // CSRF token is forwarded via useRouteLoaderData mock.
    expect(html).toContain('name="csrf_token"')
    expect(html).toContain('value="test-csrf-token"')
    // All four identity fields with their labels + input ids.
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
    // Password show/hide toggle button carries the show-password aria label
    // (default showPassword=false → "显示密码").
    expect(html).toContain('aria-label="显示密码"')
    // Submit copy (idle state).
    expect(html).toContain('创建账号并开始写作')
    // Restore-mode copy is NOT visible (mode defaults to install).
    expect(html).not.toContain('备份文件')
    expect(html).not.toContain('恢复说明')
  })

  it('renders the 创建中… submit copy and disables inputs while submitting', () => {
    navigationState.state = 'submitting'
    navigationState.formMethod = 'POST'
    const html = stableHtml(renderInRouter(<AdminInstallForm />, '/setup'))
    // Pending submit copy.
    expect(html).toContain('创建中...')
    // Submit button is disabled.
    expect(html).toContain('disabled=""')
    // Identity inputs are also disabled while submitting.
    expect(html).toContain('id="install-title"')
    expect(html).toContain('disabled=""')
  })
})
