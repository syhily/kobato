// @vitest-environment happy-dom

import type { AdminFriendDto } from '@kobato/api/contracts/admin/friends'

import { mockTanstackQuery } from '@kobato/test/mock-react-query'
import { renderWithI18n, wrapWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EditFriendDialog } from '@/ui/friends/EditFriendDialog'

const queryMocks = mockTanstackQuery()

vi.mock('@kobato/ui/components/dialog', () => import('@tests/utils/dialog'))
vi.mock('@/ui/shared/image-edit/CoverInputRow', () => ({
  CoverInputRow: ({ onChange }: { onChange: (value: string) => void }) => (
    <button type="button" onClick={() => onChange('/storage/images/links/new.example.com.jpg?v=456')}>
      模拟上传
    </button>
  ),
}))

const friend: AdminFriendDto = {
  id: '7',
  website: '旧站点',
  description: null,
  homepage: 'https://old.example.com',
  poster: '/storage/images/links/old.example.com.jpg?v=123',
  rssUrl: null,
  visible: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

function renderDialog(target: AdminFriendDto | null) {
  const view = renderWithI18n(<EditFriendDialog friend={undefined} onClose={() => {}} onSaved={() => {}} />)
  view.rerender(wrapWithI18n(<EditFriendDialog friend={target} onClose={() => {}} onSaved={() => {}} />))
}

beforeEach(() => {
  queryMocks.mutation = { mutate: vi.fn(), isPending: false }
})

describe('EditFriendDialog', () => {
  it('creates a friend with the uploaded poster instead of a custom URL field', () => {
    renderDialog(null)

    fireEvent.change(screen.getByLabelText('站名'), { target: { value: '新站点' } })
    fireEvent.change(screen.getByLabelText('主页 URL'), { target: { value: 'https://new.example.com/about' } })
    fireEvent.click(screen.getByRole('button', { name: '模拟上传' }))
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    expect(document.querySelector('input#friend-poster')).toBeNull()
    expect(queryMocks.mutation.mutate).toHaveBeenCalledWith({
      website: '新站点',
      homepage: 'https://new.example.com/about',
      poster: '/storage/images/links/new.example.com.jpg?v=456',
      visible: true,
    })
  })

  it('retargets the uploaded poster when the homepage host changes', () => {
    renderDialog(friend)

    fireEvent.change(screen.getByLabelText('主页 URL'), { target: { value: 'https://new.example.com/blog' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(queryMocks.mutation.mutate).toHaveBeenCalledWith({
      id: '7',
      website: '旧站点',
      homepage: 'https://new.example.com/blog',
      poster: '/storage/images/links/new.example.com.jpg?v=123',
      visible: true,
    })
  })
})
