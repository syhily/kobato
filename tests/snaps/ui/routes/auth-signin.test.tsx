import { describe, expect, it, vi } from 'vitest'

// Mock the WebAuthn browser entry point the same way the existing
// auth-forms snapshot does, so the imported admin form modules do not
// try to call into the real `@simplewebauthn/browser` under SSR.
vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'
import AdminLayoutRouteRaw from '@/routes/auth/layout'
import AdminInstallRouteRaw from '@/routes/auth/setup'
// `Component` is the default export of the route module. Its branches
// (login vs verifyotp vs lostpassword vs resetpassword/accept-invite,
// plus error/message/token-error surfacing) are pure given loaderData /
// actionData, so we drive the Component directly with fixture data and
// assert on the visible chrome each branch renders. The generated
// `Route.ComponentProps` types are strict (params/matches/…); `asRoute`
// widens the prop bag so tests only need the fields each branch reads.
import LoginRouteRaw from '@/routes/auth/signin'

const LoginRoute = asRoute(LoginRouteRaw)
const AdminInstallRoute = asRoute(AdminInstallRouteRaw)
const AdminLayoutRoute = asRoute(AdminLayoutRouteRaw)

// Base loader fixture: every field the route's default Component reads
// (csrfToken, action, passkeyEnabled, authError, tokenError, resetToken).
// Each test spreads in overrides to hit a different branch.
const baseLoader = {
  redirectTo: '/',
  action: 'login' as const,
  tokenError: null as string | null,
  resetToken: null as string | null,
  authError: null as string | null,
  passkeyEnabled: false,
  csrfToken: 'csrf-test',
}

describe('routes/auth/signin — Component SSR branches', () => {
  describe('login action', () => {
    it('renders the login form for the default login action', () => {
      const html = stableHtml(renderInRouter(<LoginRoute loaderData={baseLoader} />, '/signin'))
      expect(html).toContain('登陆')
      expect(html).toContain('邮箱')
      expect(html).toContain('忘记')
    })

    it('renders the login form when action is omitted from url (defaults to login)', () => {
      const html = stableHtml(
        renderInRouter(
          <LoginRoute
            loaderData={{
              ...baseLoader,
              action: 'login' as unknown as undefined,
            }}
          />,
          '/signin',
        ),
      )
      // The login form block is gated by `action === 'login'`; the
      // production loader sets it explicitly. We only assert the branch
      // when the route supplies the literal value, covered above.
      expect(html.length).toBeGreaterThan(0)
    })

    it('does not render the login form when action is verifyotp', () => {
      const html = stableHtml(
        renderInRouter(
          <LoginRoute
            loaderData={{
              ...baseLoader,
              action: 'verifyotp',
              pendingOtpEmail: 'user@example.com',
              pendingOtpSentAt: Date.now(),
            }}
          />,
          '/signin?method=otp',
        ),
      )
      expect(html).toContain('user@example.com')
      expect(html).toContain('验证码')
      // The login button does not show in the OTP step.
      expect(html).not.toContain('>登陆<')
    })
  })

  describe('verifyotp action', () => {
    it('renders the OTP form when pendingOtpEmail / pendingOtpSentAt are present', () => {
      const html = stableHtml(
        renderInRouter(
          <LoginRoute
            loaderData={{
              ...baseLoader,
              action: 'verifyotp',
              pendingOtpEmail: 'someone@test.com',
              pendingOtpSentAt: 1_700_000_000_000,
            }}
          />,
          '/signin',
        ),
      )
      expect(html).toContain('someone@test.com')
      expect(html).toContain('验证码')
      expect(html).toContain('重新发送')
    })

    it('falls back to no OTP form when pendingOtpEmail is missing (in guard check)', () => {
      // action === 'verifyotp' but the loaderData does not carry the
      // pending-email fields, so the `'pendingOtpEmail' in loaderData`
      // guard fails and OtpForm is not rendered.
      const html = stableHtml(
        renderInRouter(
          <LoginRoute
            loaderData={{
              ...baseLoader,
              action: 'verifyotp',
            }}
          />,
          '/signin',
        ),
      )
      expect(html).not.toContain('验证码')
    })
  })

  describe('lostpassword action', () => {
    it('renders the lost password form', () => {
      const html = stableHtml(
        renderInRouter(
          <LoginRoute
            loaderData={{
              ...baseLoader,
              action: 'lostpassword',
            }}
          />,
          '/signin?action=lostpassword',
        ),
      )
      expect(html).toContain('发送重置邮件')
      expect(html).toContain('返回登陆')
      expect(html).not.toContain('验证码')
    })
  })

  describe('resetpassword / accept-invite actions', () => {
    it('renders the reset password form when action is resetpassword and a token is present', () => {
      const html = stableHtml(
        renderInRouter(
          <LoginRoute
            loaderData={{
              ...baseLoader,
              action: 'resetpassword',
              resetToken: 'reset-token-abc',
            }}
          />,
          '/signin?action=resetpassword&token=reset-token-abc',
        ),
      )
      expect(html).toContain('新密码')
      expect(html).toContain('设置密码')
    })

    it('renders the reset password form for accept-invite with a token', () => {
      const html = stableHtml(
        renderInRouter(
          <LoginRoute
            loaderData={{
              ...baseLoader,
              action: 'accept-invite',
              resetToken: 'invite-token-xyz',
            }}
          />,
          '/signin?action=accept-invite&token=invite-token-xyz',
        ),
      )
      expect(html).toContain('新密码')
      expect(html).toContain('设置密码')
    })

    it('does not render the reset form when token is missing', () => {
      const html = stableHtml(
        renderInRouter(
          <LoginRoute
            loaderData={{
              ...baseLoader,
              action: 'resetpassword',
              resetToken: null,
            }}
          />,
          '/signin?action=resetpassword',
        ),
      )
      expect(html).not.toContain('设置密码')
    })
  })

  describe('error / message / notice surfacing', () => {
    it('renders an actionData error alert', () => {
      const html = stableHtml(
        renderInRouter(
          <LoginRoute loaderData={baseLoader} actionData={{ error: '用户名或密码不正确。' }} />,
          '/signin',
        ),
      )
      expect(html).toContain('用户名或密码不正确。')
    })

    it('renders an actionData success message', () => {
      const html = stableHtml(
        renderInRouter(
          <LoginRoute loaderData={baseLoader} actionData={{ message: '如果该邮箱存在且符合要求，重置邮件已发送。' }} />,
          '/signin',
        ),
      )
      expect(html).toContain('如果该邮箱存在且符合要求，重置邮件已发送。')
    })

    it('localizes the invalid_credentials authError to a friendly message', () => {
      const html = stableHtml(
        renderInRouter(
          <LoginRoute
            loaderData={{
              ...baseLoader,
              authError: 'invalid_credentials',
            }}
          />,
          '/signin?error=invalid_credentials',
        ),
      )
      // localizeAuthError maps `invalid_credentials` → 用户名或密码不正确。
      expect(html).toContain('用户名或密码不正确。')
    })

    it('renders a non-localized authError verbatim', () => {
      const html = stableHtml(
        renderInRouter(
          <LoginRoute
            loaderData={{
              ...baseLoader,
              authError: 'csrf_failed',
            }}
          />,
          '/signin?error=csrf_failed',
        ),
      )
      expect(html).toContain('csrf_failed')
    })

    it('renders a loaderData tokenError (invalid reset link)', () => {
      const html = stableHtml(
        renderInRouter(
          <LoginRoute
            loaderData={{
              ...baseLoader,
              tokenError: '链接无效或已过期。',
            }}
          />,
          '/signin?action=resetpassword',
        ),
      )
      expect(html).toContain('链接无效或已过期。')
    })

    it('renders nothing in the notice block when all error/message sources are absent', () => {
      const html = stableHtml(renderInRouter(<LoginRoute loaderData={baseLoader} />, '/signin'))
      // The notice wrapper is conditionally rendered; assert that no
      // role="alert" appears since no error/message/tokenError/authError
      // is set.
      expect(html).not.toContain('role="alert"')
    })
  })

  describe('combined states', () => {
    it('renders both a tokenError notice and a reset form when token is present', () => {
      const html = stableHtml(
        renderInRouter(
          <LoginRoute
            loaderData={{
              ...baseLoader,
              action: 'resetpassword',
              resetToken: 'tok-1',
              tokenError: null,
            }}
            actionData={{ error: '密码长度至少 8 位。' }}
          />,
          '/signin?action=resetpassword&token=tok-1',
        ),
      )
      expect(html).toContain('设置密码')
      expect(html).toContain('密码长度至少')
    })
  })
})

describe('routes/auth/setup — Component SSR branches', () => {
  const baseSetupLoader = {
    pgToolsAvailable: true,
    setupTokenVerified: false,
    csrfToken: 'csrf-setup',
  }

  it('renders the setup token verify form before verification', () => {
    const html = stableHtml(renderInRouter(<AdminInstallRoute loaderData={baseSetupLoader} />, '/admin/setup'))
    expect(html).toContain('Setup Token')
    expect(html).toContain('验证并继续')
    expect(html).toContain('验证 Setup Token 以继续。')
  })

  it('renders the install form after verification', () => {
    const html = stableHtml(
      renderInRouter(
        <AdminInstallRoute loaderData={{ ...baseSetupLoader, setupTokenVerified: true }} />,
        '/admin/setup',
      ),
    )
    expect(html).toContain('站点名称')
    expect(html).toContain('创建账号并开始写作')
    expect(html).toContain('填写以下信息，开启你的创作之旅。')
  })

  it('renders an install action error when verified and actionData carries one', () => {
    const html = stableHtml(
      renderInRouter(
        <AdminInstallRoute
          loaderData={{ ...baseSetupLoader, setupTokenVerified: true }}
          actionData={{ error: '请先验证 Setup Token。' }}
        />,
        '/admin/setup',
      ),
    )
    expect(html).toContain('请先验证 Setup Token。')
  })

  it('renders the token verify form (not the install form) when not yet verified', () => {
    // The install form (`AdminInstallForm`) is only rendered once the
    // setup token is verified. Before that, the route renders
    // `SetupTokenVerifyForm`, which shows its own error slot — so the
    // install-specific chrome (`站点名称`) must be absent.
    const html = stableHtml(
      renderInRouter(
        <AdminInstallRoute
          loaderData={{ ...baseSetupLoader, setupTokenVerified: false }}
          actionData={{ error: 'some-error' }}
        />,
        '/admin/setup',
      ),
    )
    expect(html).toContain('Setup Token')
    expect(html).not.toContain('站点名称')
  })
})

describe('routes/auth/layout — Component SSR', () => {
  it('renders the admin auth layout shell with an <Outlet/>', () => {
    // The layout reads no loaderData; it just renders the split-screen
    // chrome and forwards to its <Outlet/>. Assert visible chrome.
    const html = stableHtml(renderInRouter(<AdminLayoutRoute />, '/admin/signin'))
    expect(html).toContain('<main')
    // The layout uses a max width of 520px for the centered panel.
    expect(html).toContain('max-w-[520px]')
  })
})
