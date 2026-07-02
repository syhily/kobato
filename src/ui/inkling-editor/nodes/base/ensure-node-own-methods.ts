/**
 * Lexical 0.13.x validates node classes using `hasOwnProperty`, which only checks
 * for own properties — not inherited ones. When an outer node class extends a base
 * class (e.g. CodeBlockNode extends BaseCodeBlockNode), the static methods
 * (getType, clone, importJSON) and prototype methods (exportJSON) are inherited
 * via the prototype chain but are NOT own properties on the subclass.
 *
 * This function copies inherited methods as own properties so Lexical's
 * validation passes without warnings.
 *
 * Lexical checks (from Lexical.dev.js):
 * - `klass.hasOwnProperty('getType')`  — static
 * - `klass.hasOwnProperty('clone')`    — static
 * - `klass.hasOwnProperty('importJSON')` — static
 * - `proto.hasOwnProperty('exportJSON')` — instance
 */
// oxlint-disable-next-line typescript/no-explicit-any
export function ensureLexicalNodeOwnMethods(nodeClass: any) {
  if (typeof nodeClass !== 'function') {
    return
  }

  // Ensure required static methods are own properties on the class
  for (const method of ['getType', 'clone', 'importJSON']) {
    if (typeof nodeClass[method] === 'function' && !Object.hasOwn(nodeClass, method)) {
      Object.defineProperty(nodeClass, method, {
        value: nodeClass[method],
        writable: true,
        configurable: true,
      })
    }
  }

  // Ensure required instance methods are own properties on the prototype
  const proto = nodeClass.prototype
  if (typeof proto.exportJSON === 'function' && !Object.hasOwn(proto, 'exportJSON')) {
    Object.defineProperty(proto, 'exportJSON', {
      value: proto.exportJSON,
      writable: true,
      configurable: true,
    })
  }
}
