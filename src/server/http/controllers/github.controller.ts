import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { publicProc, resourceRateLimit } from '@/server/http/orpc-base'
import { APP_REPOSITORY } from '@/shared/config/version'
import { isRecord } from '@/shared/utils/type-guards'

const AVATAR_URL = 'https://avatars.githubusercontent.com/u/1761698?s=32'

function parseRepo(full: string): { owner: string; repo: string } | null {
  const m = full.match(/github\.com\/([^/]+)\/([^/]+)/)
  if (!m) {
    return null
  }
  return { owner: m[1]!, repo: m[2]! }
}

function isGitHubRelease(
  value: unknown,
): value is { tag_name: string; html_url: string; name: string; published_at: string } {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.tag_name === 'string' &&
    typeof value.html_url === 'string' &&
    typeof value.name === 'string' &&
    typeof value.published_at === 'string'
  )
}

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
    const parsed = parseRepo(APP_REPOSITORY)
    if (!parsed) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Invalid repository format' })
    }
    const { owner, repo } = parsed
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Failed to fetch release' })
    }
    const json: unknown = await res.json()
    if (!isGitHubRelease(json)) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Unexpected response format from GitHub API' })
    }
    return {
      tagName: json.tag_name,
      htmlUrl: json.html_url,
      name: json.name,
      publishedAt: json.published_at,
    }
  })

export const githubRouter = {
  avatar,
  release,
}
