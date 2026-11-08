// The ONE extractor for the ICU params a validation issue carries: the numeric
// bounds Zod attaches to `too_small` / `too_big` (`{min}` / `{max}`), merged
// with a custom issue's explicit `params` bag (e.g. `{ label }` or a password
// byte ceiling). Isomorphic: the server maps these onto the wire descriptor,
// the client interpolates them into a localized field error.
//
// Values are restricted to the wire's primitive set (`string | number |
// boolean | null`); arrays, objects and `undefined` are dropped. An explicit
// custom param of the same name wins over a derived bound.

export type ZodIssueParamValue = string | number | boolean | null

export type ZodIssueParams = Record<string, ZodIssueParamValue>

function isParamValue(value: unknown): value is ZodIssueParamValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function addNumericBounds(issue: object, params: ZodIssueParams): void {
  // Zod also allows bigint bounds; the catalogs speak counts / seconds / bytes.
  if ('minimum' in issue && typeof issue.minimum === 'number' && Number.isFinite(issue.minimum)) {
    params.min = issue.minimum
  }
  if ('maximum' in issue && typeof issue.maximum === 'number' && Number.isFinite(issue.maximum)) {
    params.max = issue.maximum
  }
}

/**
 * The primitive params a Zod issue carries, or `undefined` when it has none.
 * `issue.params` is the custom-issue bag; its primitives are merged over the
 * numeric bounds so a schema can override a derived name deliberately.
 */
export function zodIssueParams(issue: unknown): ZodIssueParams | undefined {
  if (typeof issue !== 'object' || issue === null) {
    return undefined
  }
  const params: ZodIssueParams = {}
  addNumericBounds(issue, params)
  if ('params' in issue && isRecord(issue.params)) {
    for (const [key, value] of Object.entries(issue.params)) {
      if (isParamValue(value)) {
        params[key] = value
      }
    }
  }
  return Object.keys(params).length === 0 ? undefined : params
}
