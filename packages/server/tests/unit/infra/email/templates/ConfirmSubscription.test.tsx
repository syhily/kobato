import { render } from '@kobato/server/infra/email/render'
import ConfirmSubscription from '@kobato/server/infra/email/templates/ConfirmSubscription'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

function renderTemplate(props: { fromName?: string; confirmLink?: string; expiresHours?: number } = {}): string {
  return render(
    createElement(ConfirmSubscription, {
      receiver: 'reader@example.com',
      fromName: props.fromName ?? '且听书吟',
      confirmLink: props.confirmLink ?? 'https://example.com/newsletter/confirm?token=abc123',
      expiresHours: props.expiresHours ?? 24,
    }),
  )
}

describe('email/templates/ConfirmSubscription', () => {
  it('renders the confirm link as both CTA href and plain text', () => {
    const html = renderTemplate()
    const link = 'https://example.com/newsletter/confirm?token=abc123'
    expect(html).toContain(`href="${link}"`)
    // Raw link text for clients that block buttons.
    expect(html).toContain(link)
  })

  it('names the sender and the expiry window', () => {
    const html = renderTemplate({ fromName: '小鱼的博客', expiresHours: 48 })
    expect(html).toContain('小鱼的博客')
    expect(html).toContain('48 小时内有效')
  })

  it('escapes HTML in the sender name', () => {
    const html = renderTemplate({ fromName: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
