// Small replacements for the utility methods this package used to import from
// an external dependency: `pick`, `kebabCase` and `escapeRegExp`. Only the
// behaviours exercised at the existing call sites are implemented.

// The strict overload keeps literal key arrays fully typed (e.g.
// `pick(image, ['src', 'width'])`); the loose overload accepts `string[]`
// constants and loosely-typed objects, mirroring the previous overload set.
// Keys absent from the object are omitted, and null/undefined input yields {}.
export function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K>
export function pick<T>(obj: T, keys: readonly string[]): Partial<T>
export function pick(obj: unknown, keys: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  if (obj !== null && typeof obj === 'object') {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = (obj as Record<string, unknown>)[key]
      }
    }
  }
  return result
}

// ASCII-only kebab-case conversion: splits camelCase/acronym boundaries and
// runs of non-alphanumerics into lowercase hyphenated words, e.g.
// 'inklingDndContainer' -> 'inkling-dnd-container', '__FOO_BAR__' -> 'foo-bar'.
export function kebabCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Escapes the usual regex special character set: \ ^ $ . * + ? ( ) [ ] { } |
const ESCAPE_REGEXP_PATTERN = /[\\^$.*+?()[\]{}|]/g

export function escapeRegExp(str: string): string {
  return str.replace(ESCAPE_REGEXP_PATTERN, '\\$&')
}
