// @vitest-environment happy-dom

import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithI18n } from '#/_helpers/i18n-render'
import { RumConsentBanner } from '@/ui/public/chrome/RumConsentBanner'

describe('ui/public/chrome/RumConsentBanner', () => {
  it('renders a labelled dialog with the title and explanation', () => {
    renderWithI18n(<RumConsentBanner onAccept={() => {}} onDecline={() => {}} />)

    expect(screen.getByRole('dialog', { name: '匿名使用统计' })).toBeTruthy()
    expect(screen.getByText(/IP 地址不会被存储/)).toBeTruthy()
  })

  it('fires the accept and decline callbacks from the two actions', () => {
    const onAccept = vi.fn()
    const onDecline = vi.fn()
    renderWithI18n(<RumConsentBanner onAccept={onAccept} onDecline={onDecline} />)

    fireEvent.click(screen.getByRole('button', { name: '同意' }))
    expect(onAccept).toHaveBeenCalledOnce()
    expect(onDecline).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '拒绝' }))
    expect(onDecline).toHaveBeenCalledOnce()
    expect(onAccept).toHaveBeenCalledOnce()
  })
})
