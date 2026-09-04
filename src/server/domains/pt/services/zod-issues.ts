/** Shared zod-issues → DomainError detail mapping for the body canonicalizers. */
export function extractZodIssues(error: unknown): { message: string; path?: string[] }[] | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }
  const issues = (error as { issues?: unknown }).issues
  if (!Array.isArray(issues)) {
    return undefined
  }
  return issues
    .filter((issue): issue is { message: string; path?: unknown[] } => typeof issue === 'object' && issue !== null)
    .map((issue) => ({
      message: typeof issue.message === 'string' ? issue.message : 'invalid body',
      path: Array.isArray(issue.path) ? issue.path.map(String) : undefined,
    }))
}
