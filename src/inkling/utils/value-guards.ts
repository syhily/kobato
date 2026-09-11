// Boundary guards for transient `initial` lambdas: the construction dataset
// is Record<string, unknown> BY DESIGN (that typing is load-bearing for
// CardSpecFieldMap), so the lambda IS the narrowing boundary — it must
// check, not assert. A truthy non-string passing `value || ''` and then
// being cast `as string` is a lie the compiler signs off on; these guards
// make the boundary honest while the declared value types keep flowing into
// TransientPropValue untouched.
export function strOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

export function fileOr<F>(value: unknown, fallback: F): File | F {
  return value instanceof File ? value : fallback
}

export function fnOr<T>(value: unknown): T | undefined {
  return typeof value === 'function' ? (value as T) : undefined
}
