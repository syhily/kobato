import { APP_REPOSITORY } from '@kobato/base/distribution/app'
import { isRecord } from '@kobato/base/utils/type-guards'
import { through } from '@kobato/server/infra/cache/registry'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'

export interface LatestRelease {
  tagName: string
  htmlUrl: string
  name: string
  publishedAt: string
}

export function parseRepo(full: string): { owner: string; repo: string } | null {
  const m = /github\.com\/([^/]+)\/([^/]+)/.exec(full)
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

export async function fetchLatestRelease(): Promise<LatestRelease> {
  const parsed = parseRepo(APP_REPOSITORY)
  if (!parsed) {
    throw new DomainError('INTERNAL', descriptorFor('update.error.repositoryInvalid'))
  }
  const { owner, repo } = parsed
  return through('githubRelease', { owner, repo, endpoint: 'releases/latest' }, async () => {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      throw new DomainError('INTERNAL', descriptorFor('update.error.releaseFetchFailed'))
    }
    const json: unknown = await res.json()
    if (!isGitHubRelease(json)) {
      throw new DomainError('INTERNAL', descriptorFor('update.error.releaseInvalidResponse'))
    }
    return {
      tagName: json.tag_name,
      htmlUrl: json.html_url,
      name: json.name,
      publishedAt: json.published_at,
    }
  })
}
