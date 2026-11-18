import { z } from 'zod'

// Public GitHub surface (`github.avatar` / `github.release`) — the single Zod
// source the `@kobato/api` github contract composes. Both procedures take no
// input; the upstream fetch/validation lives in the server domains.

// Inlined base64 data URL of this project's GitHub avatar (may be '' when the
// upstream fetch fails — the client falls back to a local placeholder).
export const githubAvatarOutputSchema = z.object({ avatar: z.string() })
export type GithubAvatarOutput = z.infer<typeof githubAvatarOutputSchema>

// The latest published GitHub release, projected by the update domain; the
// wire shape stays byte-identical to `fetchLatestRelease`.
export const githubReleaseOutputSchema = z.object({
  tagName: z.string(),
  htmlUrl: z.string(),
  name: z.string(),
  publishedAt: z.string(),
})
export type GithubReleaseOutput = z.infer<typeof githubReleaseOutputSchema>
