import type { PortableTextBody } from '@/shared/pt/schema'

import { prerenderPortableTextBody } from '@/server/infra/pt/prerender'
import { validatePortableTextBody } from '@/shared/pt/utils'

export async function canonicalizePortableTextBody(input: unknown): Promise<PortableTextBody> {
  const body = validatePortableTextBody(input)
  await prerenderPortableTextBody(body)
  return body
}
