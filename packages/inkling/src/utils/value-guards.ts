export function strOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

export function fileOr<F>(value: unknown, fallback: F): File | F {
  return value instanceof File ? value : fallback
}
