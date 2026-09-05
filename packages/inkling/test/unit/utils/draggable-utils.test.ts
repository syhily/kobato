import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyUserSelect,
  getDocumentScrollingElement,
  getNextSibling,
  getParent,
  getParentScrollableElement,
  getPreviousSibling,
} from '@/utils/draggable/draggable-utils'

describe('draggable-utils', () => {
  describe('getParent', () => {
    let root: HTMLElement

    beforeEach(() => {
      root = document.createElement('div')
      root.innerHTML = `
        <div id="a" class="match">
          <span id="b">
            <i id="c"></i>
          </span>
        </div>
      `
      document.body.appendChild(root)
    })

    afterEach(() => {
      root.remove()
    })

    it('finds the closest matching parent by selector', () => {
      const c = document.getElementById('c')
      const match = getParent(c, '.match')
      expect(match).toBe(document.getElementById('a'))
    })

    it('can match the passed element itself', () => {
      const a = document.getElementById('a')
      expect(getParent(a, '.match')).toBe(a)
    })

    it('returns null when no match exists', () => {
      const c = document.getElementById('c')
      expect(getParent(c, '.missing')).toBeNull()
    })

    it('supports a callback matcher', () => {
      const c = document.getElementById('c')
      const match = getParent(c, (el) => el.id === 'b')
      expect(match).toBe(document.getElementById('b'))
    })
  })

  describe('getNextSibling / getPreviousSibling', () => {
    let list: HTMLElement

    beforeEach(() => {
      list = document.createElement('ul')
      list.innerHTML = '<li id="one"></li><li id="two"></li><li id="three"></li>'
      document.body.appendChild(list)
    })

    afterEach(() => {
      list.remove()
    })

    it('getNextSibling returns the next matching sibling', () => {
      const one = document.getElementById('one')
      expect(getNextSibling(one, 'li')).toBe(document.getElementById('two'))
    })

    it('getNextSibling does not match the passed element', () => {
      const one = document.getElementById('one')
      expect(getNextSibling(one, '#one')).toBeNull()
    })

    it('getPreviousSibling returns the previous matching sibling', () => {
      const three = document.getElementById('three')
      expect(getPreviousSibling(three, 'li')).toBe(document.getElementById('two'))
    })

    it('supports callback matchers', () => {
      const one = document.getElementById('one')
      const next = getNextSibling(one, (el) => el.id === 'three')
      expect(next).toBe(document.getElementById('three'))
    })
  })

  describe('getParentScrollableElement', () => {
    it('returns the document scrolling element when element is null', () => {
      expect(getParentScrollableElement(null)).toBe(getDocumentScrollingElement())
    })

    it('skips statically positioned parents for absolute children', () => {
      const container = document.createElement('div')
      container.style.overflow = 'auto'
      container.style.position = 'static'

      const child = document.createElement('div')
      child.style.position = 'absolute'
      container.appendChild(child)
      document.body.appendChild(container)

      expect(getParentScrollableElement(child)).toBe(getDocumentScrollingElement())

      container.remove()
    })

    it('finds the closest scrollable parent', () => {
      const scrollable = document.createElement('div')
      scrollable.style.overflow = 'auto'

      const child = document.createElement('div')
      scrollable.appendChild(child)
      document.body.appendChild(scrollable)

      expect(getParentScrollableElement(child)).toBe(scrollable)

      scrollable.remove()
    })

    it('falls back to the document scrolling element for fixed elements', () => {
      const child = document.createElement('div')
      child.style.position = 'fixed'
      document.body.appendChild(child)

      expect(getParentScrollableElement(child)).toBe(getDocumentScrollingElement())

      child.remove()
    })
  })

  describe('applyUserSelect', () => {
    it('sets standard and vendor-prefixed user-select styles', () => {
      const el = document.createElement('div')
      // jsdom's CSSStyleDeclaration drops unknown vendor-prefixed properties,
      // so the -moz/-ms/-o writes are pinned through the setProperty mechanism
      const setPropertySpy = vi.spyOn(el.style, 'setProperty')

      applyUserSelect(el, 'none')

      expect(el.style.userSelect).toBe('none')
      expect(el.style.getPropertyValue('-webkit-user-select')).toBe('none')
      expect(setPropertySpy).toHaveBeenCalledWith('-moz-user-select', 'none')
      expect(setPropertySpy).toHaveBeenCalledWith('-ms-user-select', 'none')
      expect(setPropertySpy).toHaveBeenCalledWith('-o-user-select', 'none')
    })

    it('can clear user-select styles', () => {
      const el = document.createElement('div')
      applyUserSelect(el, 'text')
      applyUserSelect(el, '')

      expect(el.style.userSelect).toBe('')
    })
  })
})
