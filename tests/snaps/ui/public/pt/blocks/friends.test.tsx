import { describe, expect, it } from 'vitest'

import type { Friend } from '@/shared/types/catalog'

import { renderToHtml } from '#/_helpers/render'
import { Friends } from '@/ui/pt/blocks/Friends'

const friends: Friend[] = [
  {
    website: 'Alice',
    description: 'Alice writes about code.',
    homepage: 'https://alice.example',
    poster: '/images/alice-poster.png',
  },
  {
    website: 'Bob',
    description: 'Bob writes about life.',
    homepage: 'https://bob.example',
    poster: '/images/bob-poster.png',
  },
]

describe('snapshot: Friends', () => {
  it('renders the shuffled friend grid', () => {
    const html = renderToHtml(<Friends friends={friends} />)
    expect(html).toContain('左邻右舍')
    expect(html).toContain('Alice')
    expect(html).toContain('Bob')
    expect(html).toContain('https://alice.example')
    expect(html).toContain('https://bob.example')
  })

  it('renders an empty friend placeholder', () => {
    const html = renderToHtml(<Friends friends={[]} />)
    expect(html).toContain('还没有友链呢')
  })
})
