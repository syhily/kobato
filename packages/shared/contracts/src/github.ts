import { z } from 'zod'

export const githubAvatarOutputSchema = z.object({ avatar: z.string() })
export type GithubAvatarOutput = z.infer<typeof githubAvatarOutputSchema>

export const githubReleaseOutputSchema = z.object({
  tagName: z.string(),
  htmlUrl: z.string(),
  name: z.string(),
  publishedAt: z.string(),
})
export type GithubReleaseOutput = z.infer<typeof githubReleaseOutputSchema>
