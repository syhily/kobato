/**
 * Lexical validates node classes with `hasOwnProperty`, so methods a subclass
 * only inherits fail validation; copy them on as own properties.
 */
export function ensureLexicalNodeOwnMethods(nodeClass: unknown) {
  if (typeof nodeClass !== 'function') {
    return
  }

  for (const method of ['getType', 'clone', 'importJSON']) {
    const value: unknown = Reflect.get(nodeClass, method)
    if (typeof value === 'function' && !Object.hasOwn(nodeClass, method)) {
      Object.defineProperty(nodeClass, method, {
        value,
        writable: true,
        configurable: true,
      })
    }
  }

  const proto: unknown = Reflect.get(nodeClass, 'prototype')
  if (typeof proto !== 'object' || proto === null) {
    return
  }
  const exportJSON: unknown = Reflect.get(proto, 'exportJSON')
  if (typeof exportJSON === 'function' && !Object.hasOwn(proto, 'exportJSON')) {
    Object.defineProperty(proto, 'exportJSON', {
      value: exportJSON,
      writable: true,
      configurable: true,
    })
  }
}
