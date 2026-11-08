// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { AdminFriendDto } from '@/shared/contracts/friends'
import type { MetingSearchHit } from '@/shared/contracts/music'

import { wrapWithI18n } from '#/_helpers/i18n-render'
import { PendingFriendRow } from '@/ui/admin/friends/PendingFriendRow'
import { SearchResultItem } from '@/ui/admin/musics/SearchResultItem'
import { AdminInfiniteListFooter } from '@/ui/admin/shared/AdminInfiniteListFooter'

// Representative business-list copy in both locales: the shared infinite-list
// footer, the friend-link moderation row and the music search result.

const HIT: MetingSearchHit = {
  source: 'netease',
  sourceId: '42',
  name: '夜曲',
  artist: ['周杰伦'],
  album: '十一月的萧邦',
  coverUrl: '',
  previewUrl: '',
}

const FRIEND: AdminFriendDto = {
  id: 'f-1',
  website: 'Example Blog',
  description: 'A friend',
  homepage: 'https://example.com',
  poster: '',
  rssUrl: null,
  visible: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

describe('business list copy — zh-CN', () => {
  it('renders the exhausted infinite-list footer', () => {
    render(
      wrapWithI18n(<AdminInfiniteListFooter noun="评论" rowCount={3} hasNextPage={false} isFetchingNextPage={false} />),
    )
    expect(screen.getByText('已加载全部评论')).toBeTruthy()
  })

  it('renders the friend-link moderation row', () => {
    render(
      wrapWithI18n(
        <PendingFriendRow
          friend={FRIEND}
          disabled={false}
          approving={false}
          onApprove={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />,
      ),
    )
    expect(screen.getByText('待审核')).toBeTruthy()
    expect(screen.getByText('无封面')).toBeTruthy()
    expect(screen.getByRole('button', { name: '通过友链 Example Blog' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '删除友链 Example Blog' })).toBeTruthy()
  })

  it('renders the music search result actions', () => {
    render(
      wrapWithI18n(
        <SearchResultItem
          hit={HIT}
          previewActive={false}
          adding={false}
          added={false}
          onPreview={vi.fn()}
          onAdd={vi.fn()}
        />,
      ),
    )
    expect(screen.getByRole('button', { name: '试听' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /添加$/ })).toBeTruthy()
    expect(screen.getByText(/周杰伦 · 十一月的萧邦/)).toBeTruthy()
  })
})

describe('business list copy — en-US', () => {
  it('renders the exhausted infinite-list footer', () => {
    render(
      wrapWithI18n(
        <AdminInfiniteListFooter noun="comments" rowCount={3} hasNextPage={false} isFetchingNextPage={false} />,
        { locale: 'en-US' },
      ),
    )
    expect(screen.getByText('All comments loaded')).toBeTruthy()
  })

  it('renders the friend-link moderation row', () => {
    render(
      wrapWithI18n(
        <PendingFriendRow
          friend={FRIEND}
          disabled={false}
          approving={false}
          onApprove={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />,
        { locale: 'en-US' },
      ),
    )
    expect(screen.getByText('Pending')).toBeTruthy()
    expect(screen.getByText('No poster')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Approve friend link Example Blog' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete friend link Example Blog' })).toBeTruthy()
  })

  it('renders the music search result actions', () => {
    render(
      wrapWithI18n(
        <SearchResultItem
          hit={HIT}
          previewActive={false}
          adding={false}
          added={false}
          onPreview={vi.fn()}
          onAdd={vi.fn()}
        />,
        { locale: 'en-US' },
      ),
    )
    expect(screen.getByRole('button', { name: 'Preview' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Add$/ })).toBeTruthy()
  })
})
