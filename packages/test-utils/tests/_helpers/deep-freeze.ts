/** Recursively freeze an object and all its nested objects/arrays. */
export function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  if (Object.isFrozen(obj)) {
    return obj
  }
  Object.freeze(obj)
  for (const key of Reflect.ownKeys(obj)) {
    const value = (obj as Record<PropertyKey, unknown>)[key]
    if (value !== null && typeof value === 'object') {
      deepFreeze(value)
    }
  }
  return obj
}
