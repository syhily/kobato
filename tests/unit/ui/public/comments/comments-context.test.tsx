import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  useCommentsActions,
  useCommentsIdentity,
  useCommentsReplySlot,
  useCommentsTree,
} from '@/ui/public/comments/comments-context'

// The split leaf hooks replace the old `useCommentsLeafContext`, which
// silently fell back to an all-noop bag outside `<Comments>` (hiding
// test-setup mistakes behind dead callbacks). They now fail loudly, and
// the tests wrap bare leaves in the `makeLeafContext` provider instead.

function IdentityProbe() {
  useCommentsIdentity('IdentityProbe')
  return null
}

function ReplySlotProbe() {
  useCommentsReplySlot('ReplySlotProbe')
  return null
}

function ActionsProbe() {
  useCommentsActions('ActionsProbe')
  return null
}

function TreeProbe() {
  useCommentsTree('TreeProbe')
  return null
}

describe('comments-context hooks outside <Comments>', () => {
  it('useCommentsIdentity throws a helpful error', () => {
    expect(() => renderToStaticMarkup(<IdentityProbe />)).toThrow(/must be rendered inside <Comments>/u)
  })

  it('useCommentsReplySlot throws a helpful error', () => {
    expect(() => renderToStaticMarkup(<ReplySlotProbe />)).toThrow(/must be rendered inside <Comments>/u)
  })

  it('useCommentsActions throws a helpful error', () => {
    expect(() => renderToStaticMarkup(<ActionsProbe />)).toThrow(/must be rendered inside <Comments>/u)
  })

  it('useCommentsTree throws a helpful error', () => {
    expect(() => renderToStaticMarkup(<TreeProbe />)).toThrow(/must be rendered inside <Comments>/u)
  })
})
