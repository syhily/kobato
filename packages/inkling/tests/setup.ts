import '@kobato/test/setup/unit'
import { installWebStreamGlobals } from '@kobato/test/web-streams'

installWebStreamGlobals()

if (typeof globalThis.DOMParser !== 'function' && globalThis.window?.DOMParser) {
  globalThis.DOMParser = globalThis.window.DOMParser as unknown as typeof globalThis.DOMParser
}

function MockResizeObserver() {}
MockResizeObserver.prototype.observe = () => {}
MockResizeObserver.prototype.unobserve = () => {}
MockResizeObserver.prototype.disconnect = () => {}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

function MockIntersectionObserver() {}
MockIntersectionObserver.prototype.observe = () => {}
MockIntersectionObserver.prototype.unobserve = () => {}
MockIntersectionObserver.prototype.disconnect = () => {}
MockIntersectionObserver.prototype.takeRecords = () => []
globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver

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
