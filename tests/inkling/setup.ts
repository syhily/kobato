import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom does not implement ResizeObserver, but several components depend on it.
function MockResizeObserver() {}
MockResizeObserver.prototype.observe = () => {}
MockResizeObserver.prototype.unobserve = () => {}
MockResizeObserver.prototype.disconnect = () => {}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

// IntersectionObserver is also absent from jsdom and may be required by lazy loaders.
function MockIntersectionObserver() {}
MockIntersectionObserver.prototype.observe = () => {}
MockIntersectionObserver.prototype.unobserve = () => {}
MockIntersectionObserver.prototype.disconnect = () => {}
MockIntersectionObserver.prototype.takeRecords = () => []
globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver

// Node ≥ 23 ships a built-in `localStorage` global that warns (and yields
// undefined) unless --localstorage-file was passed. Vitest 5 wires the jsdom
// implementation over it, but keep an in-memory Storage fallback for runtimes
// where the ambient one is missing or broken so tests always see a working
// implementation.
class InMemoryStorage implements Storage {
  private readonly store = new Map<string, string>()
  get length() {
    return this.store.size
  }
  clear() {
    this.store.clear()
  }
  getItem(key: string) {
    return this.store.get(key) ?? null
  }
  key(index: number) {
    return [...this.store.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
}

if (typeof globalThis.localStorage?.setItem !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new InMemoryStorage(),
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  cleanup()
})
