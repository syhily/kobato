import { describe, expect, it } from 'vitest'

import { renderToHtml } from '#/_helpers/render'
import { LikeShare } from '@/ui/public/LikeActions'

describe('snapshot: LikeShare', () => {
  it('renders the QQ, WeChat QR, and Weibo share buttons', () => {
    const post = {
      title: 'Hello World',
      summary: 'A sample post summary.',
      cover: 'https://example.com/cover.png',
      permalink: '/posts/hello-world',
    }

    const html = renderToHtml(<LikeShare post={post} />)

    expect(html).toContain('分享到 QQ 空间')
    expect(html).toContain('connect.qq.com/widget/shareqq/index.html')
    expect(html).toContain('在微信中请长按二维码')
    expect(html).toContain('微信扫一扫 分享朋友圈')
    expect(html).toContain('service.weibo.com/share/share.php')
    expect(html).toContain('Hello+World')
    expect(html).toContain('sample+post+summary.')
  })
})
