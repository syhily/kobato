// Boundary guards for transient `initial` lambdas. The construction dataset is
// Record<string, unknown> by design, so the lambda is the narrowing boundary and must
// check, never assert. Function-valued props need a concrete guard in the declaration.
export function strOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

export function fileOr<F>(value: unknown, fallback: F): File | F {
  return value instanceof File ? value : fallback
}
