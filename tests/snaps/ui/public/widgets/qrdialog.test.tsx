import { describe, expect, it } from 'vitest'

import { renderToHtml } from '#/_helpers/render'
import { WechatIcon } from '@/ui/icons/brand'
import { QRDialog } from '@/ui/public/widgets/QRDialog'

describe('snapshot: QRDialog', () => {
  it('renders the trigger button and hides the popup during SSR', () => {
    const html = renderToHtml(
      <QRDialog
        url="https://example.com/share"
        name="在微信中请长按二维码"
        title="微信扫一扫 分享朋友圈"
        trigger={<WechatIcon className="size-5" />}
      />,
    )

    expect(html).toContain('aria-label="微信扫一扫 分享朋友圈"')
    expect(html).toContain('title="在微信中请长按二维码"')
    expect(html).not.toContain('Popup body')
  })
})
