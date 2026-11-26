import { renderToHtml } from '@kobato/web-kit/tests/utils/render'
import { Popup } from '@sayaka/ui/widgets/Popup'
import { Suspense } from 'react'
import { describe, expect, it } from 'vitest'

describe('snapshot: Popup', () => {
  it('leaves the Suspense fallback during SSR because the component is portal-based', () => {
    const html = renderToHtml(
      <Suspense fallback={null}>
        <Popup open onClose={() => undefined} aria-label="Test popup">
          <div>Popup body</div>
        </Popup>
      </Suspense>,
    )
    expect(html).not.toContain('Popup body')
    expect(html).not.toContain('role="dialog"')
  })
})
