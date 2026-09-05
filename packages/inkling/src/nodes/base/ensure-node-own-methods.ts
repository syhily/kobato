/**
 * Lexical validates node classes using `hasOwnProperty`, which only checks
 * for own properties — not inherited ones. When an outer node class extends a base
 * class (e.g. CodeBlockNode extends BaseCodeBlockNode), the static methods
 * (getType, clone, importJSON) and prototype methods (exportJSON) are inherited
 * via the prototype chain but are NOT own properties on the subclass.
 *
 * This function copies inherited methods as own properties so Lexical's
 * validation passes without warnings.
 *
 * Lexical checks (still present in the shipped Lexical 0.46:
 * `hasOwnStaticMethod` → `hasOwn(klass, k)` in Lexical.dev.js):
 * - `klass.hasOwnProperty('getType')`  — static
 * - `klass.hasOwnProperty('clone')`    — static
 * - `klass.hasOwnProperty('importJSON')` — static
 * - `proto.hasOwnProperty('exportJSON')` — instance
 */
export function ensureLexicalNodeOwnMethods(nodeClass: unknown) {
  if (typeof nodeClass !== 'function') {
    return
  }

  // Ensure required static methods are own properties on the class
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

  // Ensure required instance methods are own properties on the prototype
  const proto: { exportJSON?: unknown } = nodeClass.prototype
  if (typeof proto.exportJSON === 'function' && !Object.hasOwn(proto, 'exportJSON')) {
    Object.defineProperty(proto, 'exportJSON', {
      value: proto.exportJSON,
      writable: true,
      configurable: true,
    })
  }
}
