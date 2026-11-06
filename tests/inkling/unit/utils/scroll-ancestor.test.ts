import { describe, expect, it } from 'vitest'

import { getScrollAncestor } from '@/inkling/utils/scroll-ancestor'

describe('getScrollAncestor — floating policy', () => {
  it('returns document.body when node is missing', () => {
    expect(getScrollAncestor(null)).toBe(document.body)
  })

  it('returns the node itself when it is scrollable', () => {
    // Attached to the document: jsdom 31's getComputedStyle resolves no
    // styles for detached nodes.
    const node = document.createElement('div')
    node.style.overflowY = 'auto'
    Object.defineProperty(node, 'scrollHeight', { value: 200 })
    Object.defineProperty(node, 'clientHeight', { value: 100 })
    document.body.appendChild(node)

    expect(getScrollAncestor(node)).toBe(node)

    node.remove()
  })

  it('walks up the tree until it finds a scrollable parent', () => {
    // Attached to the document: jsdom 31's getComputedStyle resolves no
    // styles for detached nodes.
    const parent = document.createElement('div')
    parent.style.overflowY = 'scroll'
    Object.defineProperty(parent, 'scrollHeight', { value: 300 })
    Object.defineProperty(parent, 'clientHeight', { value: 100 })

    const child = document.createElement('div')
    parent.appendChild(child)
    document.body.appendChild(parent)

    expect(getScrollAncestor(child)).toBe(parent)

    parent.remove()
  })

  it('falls back to document.body when no scrollable ancestor exists', () => {
    const node = document.createElement('span')
    document.body.appendChild(node)

    expect(getScrollAncestor(node)).toBe(document.body)

    node.remove()
  })
})
