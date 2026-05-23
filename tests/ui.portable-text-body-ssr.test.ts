import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PortableTextBody } from '@/ui/pt/render'

describe('PortableTextBody SSR', () => {
  it('renders solution blocks (same path as page.detail + PreviewPane)', () => {
    const body = [
      {
        _type: 'solution' as const,
        _key: 's1',
        children: [
          {
            _type: 'block' as const,
            _key: 'p',
            style: 'normal' as const,
            children: [{ _type: 'span' as const, _key: 't', text: 'inner text' }],
          },
        ],
      },
    ]
    const html = renderToStaticMarkup(createElement(PortableTextBody, { body, headingSlugs: [] }))
    expect(html).toContain('解')
    expect(html).toContain('inner text')
  })
})
