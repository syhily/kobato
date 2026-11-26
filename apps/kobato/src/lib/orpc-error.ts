import { ORPCError } from '@orpc/client'

export function isOrpcErrorWithCode(error: unknown, code: string): error is ORPCError<string, unknown> {
  return error instanceof ORPCError && error.code === code
}
