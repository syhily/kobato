import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  useCommentsActions,
  useCommentsIdentity,
  useCommentsReplySlot,
  useCommentsTree,
} from '@/ui/public/comments/comments-context'

// The leaf hooks fail loudly outside `<Comments>` (an all-noop bag would
// hide test-setup mistakes behind dead callbacks); wrap bare leaves in the
// `makeLeafContext` provider.

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
