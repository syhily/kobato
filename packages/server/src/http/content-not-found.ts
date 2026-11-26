import { ORPCError } from '@orpc/server'

export function contentNotFound(): never {
  throw new ORPCError('NOT_FOUND', { message: 'Not Found' })
}
