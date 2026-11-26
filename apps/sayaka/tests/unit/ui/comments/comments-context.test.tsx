import {
  useCommentsActions,
  useCommentsIdentity,
  useCommentsReplySlot,
  useCommentsTree,
} from '@sayaka/ui/comments/comments-context'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

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
