// The strict overload keeps literal key arrays fully typed; the loose overload accepts
// `string[]` constants and loosely-typed objects. Keys absent from the object are omitted
// and null/undefined input yields {}.
export function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K>
export function pick<T>(obj: T, keys: readonly string[]): Partial<T>
export function pick(obj: unknown, keys: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  if (obj !== null && typeof obj === 'object') {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // Reflect.get keeps the read honest (getters included) without a
        // narrowing assertion on the object-typed value
        result[key] = Reflect.get(obj, key)
      }
    }
  }
  return result
}

// ASCII-only kebab-case: camelCase/acronym boundaries and runs of non-alphanumerics
// become single hyphens.
export function kebabCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const ESCAPE_REGEXP_PATTERN = /[\\^$.*+?()[\]{}|]/g

export function escapeRegExp(str: string): string {
  return str.replace(ESCAPE_REGEXP_PATTERN, '\\$&')
}
