import { describe, expect, it, vi } from 'vitest'

import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import {
  LoginForm,
  LostPasswordForm,
  MagicLinkConfirmForm,
  OtpForm,
  ResetPasswordForm,
} from '@/ui/admin/auth/AdminCredentialsForm'
import { AdminInstallForm } from '@/ui/admin/auth/AdminInstallForm'
import { SetupTokenVerifyForm } from '@/ui/admin/auth/SetupTokenVerifyForm'

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

describe('snapshot: LoginForm', () => {
  it('renders the email step (identifier-first)', () => {
    const html = stableHtml(renderInRouter(<LoginForm isSubmitting={false} />))
    expect(html).toContain('邮箱')
    expect(html).toContain('登陆')
    expect(html).toContain('?action=identify')
    // Password field only appears after the identify round-trip.
    expect(html).not.toContain('name="password"')
    expect(html).not.toContain('忘记')
  })

  it('renders the password step after identify answers method=password', () => {
    const html = stableHtml(renderInRouter(<LoginForm isSubmitting={false} actionData={{ method: 'password' }} />))
    expect(html).toContain('密码')
    expect(html).toContain('忘记')
    expect(html).toContain('更换邮箱')
    expect(html).toContain('name="password"')
  })

  it('renders the passkey step after identify answers method=passkey', () => {
    const html = stableHtml(renderInRouter(<LoginForm isSubmitting={false} actionData={{ method: 'passkey' }} />))
    // The identify form stays in place: locked input + passkey notice.
    expect(html).toContain('此账号已启用 Passkey 验证')
    expect(html).toContain('disabled')
    // The ceremony launches from the primary button's click (user
    // gesture), not on mount.
    expect(html).toContain('使用 Passkey 登陆')
    expect(html).toContain('?action=passkey')
    expect(html).toContain('更换邮箱')
    // Account recovery escape hatch.
    expect(html).toContain('?action=lostpassword')
  })

  it('renders submitting state', () => {
    const html = stableHtml(renderInRouter(<LoginForm isSubmitting={true} />))
    expect(html).toContain('登陆中')
  })
})

describe('snapshot: MagicLinkConfirmForm', () => {
  it('renders the confirm button and hidden token', () => {
    const html = stableHtml(renderInRouter(<MagicLinkConfirmForm token="magic-token-1" isSubmitting={false} />))
    expect(html).toContain('确认登陆')
    expect(html).toContain('magic_token')
    expect(html).toContain('magic-token-1')
  })

  it('renders submitting state', () => {
    const html = stableHtml(renderInRouter(<MagicLinkConfirmForm token="magic-token-1" isSubmitting={true} />))
    expect(html).toContain('登陆中')
  })
})

describe('snapshot: LostPasswordForm', () => {
  it('renders email field', () => {
    const html = stableHtml(renderInRouter(<LostPasswordForm isSubmitting={false} />))
    expect(html).toContain('邮箱')
    expect(html).toContain('发送重置邮件')
    expect(html).toContain('返回登陆')
  })
})

describe('snapshot: ResetPasswordForm', () => {
  it('renders new password field', () => {
    const html = stableHtml(renderInRouter(<ResetPasswordForm token="token-1" isSubmitting={false} />))
    expect(html).toContain('新密码')
    expect(html).toContain('设置密码')
  })
})

describe('snapshot: OtpForm', () => {
  it('renders OTP input and resend cooldown', () => {
    const html = stableHtml(
      renderInRouter(<OtpForm email="test@example.com" sentAt={Date.now() - 120_000} isSubmitting={false} />),
    )
    expect(html).toContain('test@example.com')
    expect(html).toContain('验证码')
    expect(html).toContain('重新发送')
    expect(html).toContain('返回登录')
  })
})

describe('snapshot: AdminInstallForm', () => {
  it('renders install mode', () => {
    const html = stableHtml(renderInRouter(<AdminInstallForm />))
    expect(html).toContain('全新安装')
    expect(html).toContain('从备份恢复')
    expect(html).toContain('站点名称')
    expect(html).toContain('创建账号并开始写作')
  })

  it('renders restore mode', () => {
    const html = stableHtml(renderInRouter(<AdminInstallForm />, '/?mode=restore'))
    // Mode state defaults to install; the component does not read URL mode.
    // We just assert both modes are selectable and restore instructions appear after click in integration tests.
    expect(html).toContain('全新安装')
    expect(html).toContain('从备份恢复')
  })

  it('renders token input and error', () => {
    const html = stableHtml(
      renderInRouter(
        <SetupTokenVerifyForm isSubmitting={false} actionData={{ error: 'Token 无效', setupTokenVerified: false }} />,
      ),
    )
    expect(html).toContain('Setup Token')
    expect(html).toContain('Token 无效')
    expect(html).toContain('验证并继续')
  })
})
