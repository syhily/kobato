import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { fetchLatestRelease } from '@/server/domains/update/release'
import { publicProc, resourceRateLimit } from '@/server/http/orpc-base'
import { DomainError } from '@/server/infra/http/errors'

const AVATAR_URL = 'https://avatars.githubusercontent.com/u/1761698?s=32'

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

const avatar = publicProc
  .route({ method: 'GET', path: '/github/avatar' })
  .output(z.object({ avatar: z.string() }))
  .use(resourceRateLimit)
  .handler(async () => {
    const res = await fetch(AVATAR_URL, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) {
      return { avatar: '' }
    }
    const buffer = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') ?? 'image/png'
    const base64 = arrayBufferToBase64(buffer)
    return { avatar: `data:${contentType};base64,${base64}` }
  })

const release = publicProc
  .route({ method: 'GET', path: '/github/release' })
  .output(
    z.object({
      tagName: z.string(),
      htmlUrl: z.string(),
      name: z.string(),
      publishedAt: z.string(),
    }),
  )
  .use(resourceRateLimit)
  .handler(async () => {
    // The fetch/validate logic lives in the update domain; the wire shape
    // (ORPCError code + message) stays byte-identical to the pre-extraction
    // handler.
    try {
      return await fetchLatestRelease()
    } catch (err) {
      if (err instanceof DomainError) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', { message: err.message })
      }
      throw err
    }
  })

export const githubRouter = {
  avatar,
  release,
}
