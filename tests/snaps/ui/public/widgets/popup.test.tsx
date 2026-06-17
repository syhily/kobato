import { describe, expect, it } from 'vitest'

import { renderToHtml } from '#/_helpers/render'
import { Popup } from '@/ui/public/widgets/Popup'

describe('snapshot: Popup', () => {
  it('renders nothing during SSR because the component is portal-based', () => {
    const html = renderToHtml(
      <Popup open onClose={() => undefined} popupId="test-popup" aria-label="Test popup">
        <div>Popup body</div>
      </Popup>,
    )
    expect(html).toBe('')
  })
})
