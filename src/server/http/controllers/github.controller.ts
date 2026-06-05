import { z } from 'zod'

import { publicProc } from '@/server/http/orpc-base'
import { APP_REPOSITORY } from '@/shared/config/version'

const AVATAR_URL = 'https://avatars.githubusercontent.com/u/1761698?s=32'

function parseRepo(full: string): { owner: string; repo: string } | null {
  const m = full.match(/github\.com\/([^/]+)\/([^/]+)/)
  if (!m) {return null}
  return { owner: m[1]!, repo: m[2]! }
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
  .handler(async () => {
    const res = await fetch(AVATAR_URL)
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
  .handler(async () => {
    const parsed = parseRepo(APP_REPOSITORY)
    if (!parsed) {
      throw new Error('Invalid repository format')
    }
    const { owner, repo } = parsed
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`)
    if (!res.ok) {
      throw new Error('Failed to fetch release')
    }
    const data = (await res.json()) as {
      tag_name: string
      html_url: string
      name: string
      published_at: string
    }
    return {
      tagName: data.tag_name,
      htmlUrl: data.html_url,
      name: data.name,
      publishedAt: data.published_at,
    }
  })

export const githubRouter = {
  avatar,
  release,
}
