/**
 * Helper to safely access/modify properties on GeneratedDecoratorNode instances.
 * GeneratedDecoratorNodeBase has `[key: string]: unknown` which makes direct
 * property access return `unknown`. This helper provides typed access.
 *
 * Usage:
 *   nodeProp(node, 'src')           // read: returns string (caller must know the type)
 *   nodeProp(node, 'src', 'value')  // write: sets the property
 */
export function nodeProp<T = string>(node: Record<string, unknown>, key: string): T
export function nodeProp<T = string>(node: Record<string, unknown>, key: string, value: T): void
export function nodeProp<T = string>(node: Record<string, unknown>, key: string, value?: T): T | void {
  if (arguments.length === 3) {
    node[key] = value
    return
  }
  return node[key] as T
}
