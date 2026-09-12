// Boundary guards for transient `initial` lambdas: the construction dataset
// is Record<string, unknown> BY DESIGN (that typing is load-bearing for
// CardSpecFieldMap), so the lambda IS the narrowing boundary — it must
// check, not assert. A truthy non-string passing `value || ''` and then
// being cast `as string` is a lie the compiler signs off on; these guards
// make the boundary honest while the declared value types keep flowing into
// TransientPropValue untouched. Function-valued props (e.g. the image card's
// selector overlay) can't live here — the narrowed signature is the
// producer's contract, so the declaration carries its own concrete guard.
export function strOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

export function fileOr<F>(value: unknown, fallback: F): File | F {
  return value instanceof File ? value : fallback
}
