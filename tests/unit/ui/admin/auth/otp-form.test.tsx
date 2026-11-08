// @vitest-environment happy-dom

import { act, render } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import type { LoginActionData } from '@/ui/admin/auth/AdminCredentialsForm'

import { wrapWithI18n } from '#/_helpers/i18n-render'
import { OtpForm } from '@/ui/admin/auth/OtpForm'

// The resend acknowledgment must restart the cooldown by IDENTITY (the action's
// typed descriptor), never by comparing the localized sentence — the sentence
// changes with the site locale.

const SENT_LONG_AGO = Date.now() - 120_000

const control: { setActionData: (data: LoginActionData | null) => void } = { setActionData: () => {} }

function Harness() {
  const [actionData, setActionData] = useState<LoginActionData | null>(null)
  useEffect(() => {
    control.setActionData = setActionData
  }, [])
  return <OtpForm email="admin@example.com" sentAt={SENT_LONG_AGO} isSubmitting={false} actionData={actionData} />
}

function mount() {
  const router = createMemoryRouter([{ path: '*', element: <Harness /> }])
  return render(wrapWithI18n(<RouterProvider router={router} />))
}

function deliver(data: LoginActionData): void {
  act(() => {
    control.setActionData(data)
  })
}

function resendSent(sentence: string): LoginActionData {
  return {
    message: sentence,
    messageDescriptor: {
      messageKey: 'auth.otp.success.resent',
      fallbackMessage: 'A new verification code has been sent.',
    },
  }
}

describe('OtpForm resend cooldown', () => {
  it('restarts the cooldown from the descriptor key, not the localized message', () => {
    const { container } = mount()
    expect(container.textContent).toContain('重新发送')

    deliver(resendSent('A new verification code has been sent.'))
    expect(container.textContent).toContain('60 秒后重新发送')
  })

  it('ignores a legacy sentence without a descriptor', () => {
    const { container } = mount()

    // A bare localized string is not an identity: the cooldown stays off.
    deliver({ message: '验证码已重新发送。' })
    expect(container.textContent).not.toContain('60 秒后重新发送')
  })

  it('ignores a different descriptor', () => {
    const { container } = mount()

    deliver({
      message: 'The verification code is invalid or has expired.',
      messageDescriptor: {
        messageKey: 'auth.otp.error.invalid',
        fallbackMessage: 'The verification code is invalid or has expired.',
      },
    })
    expect(container.textContent).not.toContain('60 秒后重新发送')
  })
})
