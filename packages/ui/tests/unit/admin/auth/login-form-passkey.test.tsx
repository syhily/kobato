// @vitest-environment happy-dom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useActionData } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Reproduction harness for the passkey signin client chain:
// identify answer → passkey step → verify-button click → authBegin →
// ceremony → hidden-form requestSubmit. The WebAuthn ceremony and the oRPC
// call are mocked; everything inside LoginForm runs for real.
const mocks = vi.hoisted(() => ({
  authBegin: vi.fn(),
  startAuthentication: vi.fn(),
  cancelCeremony: vi.fn(),
}))

vi.mock('@kobato/client/api/client', () => ({
  orpc: {
    passkey: {
      authBegin: mocks.authBegin,
    },
  },
}))

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: mocks.startAuthentication,
  WebAuthnAbortService: { cancelCeremony: mocks.cancelCeremony },
}))

import { LoginForm } from '@kobato/ui/admin/auth/AdminCredentialsForm'

function renderLoginForm(actionData?: { method: 'passkey' | 'password' }) {
  const routes = [
    {
      path: '*',
      element: <LoginForm isSubmitting={false} csrfToken="csrf" actionData={actionData ?? null} />,
    },
  ]
  const router = createMemoryRouter(routes, { initialEntries: ['/admin/signin?action=identify'] })
  return render(<RouterProvider router={router} />)
}

// The production path: the route's action answers the identify POST and
// the same mounted LoginForm transitions into the passkey step.
function SigninRoute() {
  const actionData = useActionData() as { method: 'passkey' } | undefined
  return <LoginForm isSubmitting={false} csrfToken="csrf" actionData={actionData ?? null} />
}

function renderLoginRoute() {
  const routes = [
    {
      path: '/admin/signin',
      action: () => ({ method: 'passkey' as const }),
      Component: SigninRoute,
    },
  ]
  const router = createMemoryRouter(routes, { initialEntries: ['/admin/signin'] })
  return render(<RouterProvider router={router} />)
}

const verifyButton = () => screen.getByRole('button', { name: /Passkey 登陆/ })

describe('LoginForm passkey chain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // happy-dom has no WebAuthn API; the support check only needs the
    // constructor to exist.
    vi.stubGlobal('PublicKeyCredential', class {})
    mocks.authBegin.mockResolvedValue({
      options: { challenge: 'Y2hhbGxlbmdl', rpId: 'yufan.me', userVerification: 'required' },
    })
    mocks.startAuthentication.mockResolvedValue({ id: 'cred-1', type: 'public-key', response: {} })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('locks the email input, shows the passkey notice, and waits for a click', async () => {
    renderLoginForm({ method: 'passkey' })

    // The identify form stays in place — the input is locked and the
    // account's passkey requirement is explained.
    expect(screen.getByLabelText('邮箱')).toBeDisabled()
    expect(screen.getByText('此账号已启用 Passkey 验证，请点击上方按钮完成登陆。')).toBeInTheDocument()

    // No network or ceremony has started — the browser requires a user
    // gesture for modal WebAuthn.
    expect(verifyButton()).toBeInTheDocument()
    expect(mocks.authBegin).not.toHaveBeenCalled()
    expect(mocks.startAuthentication).not.toHaveBeenCalled()
  })

  it('submits the hidden form after a click-driven ceremony', async () => {
    const submitSpy = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {})

    renderLoginForm({ method: 'passkey' })
    fireEvent.click(verifyButton())

    await waitFor(() => expect(mocks.authBegin).toHaveBeenCalled())
    await waitFor(() => expect(mocks.startAuthentication).toHaveBeenCalled())
    await waitFor(() => expect(submitSpy).toHaveBeenCalled())

    const form = submitSpy.mock.instances[0] as HTMLFormElement | undefined
    expect(form).toBeDefined()
    expect(form!.querySelector('input[name="passkey_response"]')).not.toBeNull()
    const challengeInput = form!.querySelector('input[name="passkey_challenge"]')
    expect(challengeInput).not.toBeNull()
    expect((challengeInput as HTMLInputElement).value).toBe('Y2hhbGxlbmdl')

    submitSpy.mockRestore()
  })

  it('walks the production path: email → identify action → passkey step → click → hidden submit', async () => {
    const submitSpy = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {})

    renderLoginRoute()

    // Type the email and submit the identify form for real (React Router
    // runs the route action and feeds actionData back into LoginForm).
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'admin@yufan.me' } })
    fireEvent.submit(screen.getByLabelText('邮箱').closest('form')!)

    // The passkey step appears — but nothing launches without a gesture.
    await waitFor(() => expect(verifyButton()).toBeInTheDocument())
    expect(mocks.authBegin).not.toHaveBeenCalled()

    fireEvent.click(verifyButton())

    await waitFor(() => expect(mocks.authBegin).toHaveBeenCalledWith({ email: 'admin@yufan.me' }))
    await waitFor(() => expect(mocks.startAuthentication).toHaveBeenCalled())
    await waitFor(() => expect(submitSpy).toHaveBeenCalled())

    submitSpy.mockRestore()
  })

  it('surfaces a ceremony rejection as a visible error and offers retry', async () => {
    vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {})
    mocks.startAuthentication.mockRejectedValue(new DOMException('cancelled', 'NotAllowedError'))

    renderLoginForm({ method: 'passkey' })
    fireEvent.click(verifyButton())

    await waitFor(() => {
      expect(document.querySelector('[role="alert"]')?.textContent).toContain('Passkey 验证被取消或超时。')
    })
    // Pending cleared: the button is armed again, labelled as a retry.
    expect(verifyButton()).toBeEnabled()
    expect(verifyButton().textContent).toContain('重试 Passkey 登陆')
  })

  it('times out a hung ceremony: error shown, prompt cancelled, no submit', async () => {
    vi.useFakeTimers()
    const submitSpy = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {})
    // The QR/hybrid failure mode: the promise never settles.
    mocks.startAuthentication.mockReturnValue(new Promise(() => {}))

    renderLoginForm({ method: 'passkey' })
    fireEvent.click(verifyButton())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mocks.startAuthentication).toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })

    expect(mocks.cancelCeremony).toHaveBeenCalled()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Passkey 验证超时')
    expect(submitSpy).not.toHaveBeenCalled()
    expect(verifyButton()).toBeEnabled()

    submitSpy.mockRestore()
  })

  it('ignores a ceremony that completes after the timeout retired it', async () => {
    vi.useFakeTimers()
    const submitSpy = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {})
    let resolveCeremony: (value: unknown) => void = () => {}
    mocks.startAuthentication.mockReturnValue(
      new Promise((resolve) => {
        resolveCeremony = resolve
      }),
    )

    renderLoginForm({ method: 'passkey' })
    fireEvent.click(verifyButton())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Passkey 验证超时')

    // The phone-side approval arrives late — the retired run must not act.
    resolveCeremony({ id: 'cred-1', type: 'public-key', response: {} })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(submitSpy).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Passkey 验证超时')

    submitSpy.mockRestore()
  })

  it('recovers via retry after a timeout', async () => {
    vi.useFakeTimers()
    const submitSpy = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {})
    mocks.startAuthentication.mockReturnValueOnce(new Promise(() => {}))

    renderLoginForm({ method: 'passkey' })
    fireEvent.click(verifyButton())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Passkey 验证超时')

    // Retry: a fresh gesture starts a fresh ceremony, and this one
    // completes (the default mock resolves).
    fireEvent.click(verifyButton())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mocks.startAuthentication).toHaveBeenCalledTimes(2)
    expect(submitSpy).toHaveBeenCalled()

    submitSpy.mockRestore()
  })

  it('cancels the ceremony when the user leaves the passkey step', async () => {
    const submitSpy = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {})
    mocks.startAuthentication.mockReturnValue(new Promise(() => {}))

    renderLoginForm({ method: 'passkey' })
    fireEvent.click(verifyButton())
    await waitFor(() => expect(mocks.startAuthentication).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: '更换邮箱' }))

    expect(mocks.cancelCeremony).toHaveBeenCalled()
    expect(submitSpy).not.toHaveBeenCalled()

    submitSpy.mockRestore()
  })

  it('renders the account-recovery escape hatch', () => {
    renderLoginForm({ method: 'passkey' })

    const link = screen.getByRole('link', { name: '通过邮箱重置密码' })
    expect(link).toHaveAttribute('href', '/admin/signin?action=lostpassword')
  })
})
