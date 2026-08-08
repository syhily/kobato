// Latest-release lookup against the GitHub Releases API.
// Shared by the public `github.release` procedure and the self-update domain.

import type { Database } from '@/server/infra/db/database'

import { through } from '@/server/infra/cache/registry'
import { DomainError } from '@/server/infra/http/errors'
import { APP_REPOSITORY } from '@/shared/config/version'
import { isRecord } from '@/shared/utils/type-guards'

export interface LatestRelease {
  tagName: string
  htmlUrl: string
  name: string
  publishedAt: string
}

export function parseRepo(full: string): { owner: string; repo: string } | null {
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

export async function fetchLatestRelease(db: Database): Promise<LatestRelease> {
  const parsed = parseRepo(APP_REPOSITORY)
  if (!parsed) {
    throw new DomainError('INTERNAL', 'Invalid repository format')
  }
  const { owner, repo } = parsed
  // Read-through the short-TTL bucket; failed fetches are never cached.
  return through(db, 'githubRelease', { owner, repo, endpoint: 'releases/latest' }, async () => {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      throw new DomainError('INTERNAL', 'Failed to fetch release')
    }
    const json: unknown = await res.json()
    if (!isGitHubRelease(json)) {
      throw new DomainError('INTERNAL', 'Unexpected response format from GitHub API')
    }
    return {
      tagName: json.tag_name,
      htmlUrl: json.html_url,
      name: json.name,
      publishedAt: json.published_at,
    }
  })
}
