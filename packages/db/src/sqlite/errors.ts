const SQLITE_CONSTRAINT_PRIMARYKEY = 1555
const SQLITE_CONSTRAINT_UNIQUE = 2067

function errcodeOf(candidate: unknown): number | undefined {
  if (candidate !== null && typeof candidate === 'object' && 'errcode' in candidate) {
    const code = candidate.errcode
    if (typeof code === 'number') {
      return code
    }
  }
  return undefined
}

export function isUniqueConstraintError(err: unknown, constraintName?: string): boolean {
  const candidates = [err, err instanceof Error ? err.cause : undefined]
  return candidates.some((candidate) => {
    const code = errcodeOf(candidate)
    if (code !== SQLITE_CONSTRAINT_UNIQUE && code !== SQLITE_CONSTRAINT_PRIMARYKEY) {
      return false
    }
    if (constraintName) {
      return candidate instanceof Error && candidate.message.includes(constraintName)
    }
    return true
  })
}
