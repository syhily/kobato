// Playwright global setup: stage the public fixture (one published post with comments
// enabled and `contentLanguage: 'ar'`) plus the deterministic general settings baseline;
// the returned teardown removes what the run created. Everything goes through the admin
// HTTP surface of the instance the browser drives — no database seam, config file or secret.

import { browserEnv } from './env'
import { SettingsApi } from './settings-api'

export default async function globalSetup() {
  const env = browserEnv()
  process.stdout.write(`[browser] staging fixture against ${env.baseUrl} (post "${env.postSlug}")\n`)

  const api = await SettingsApi.connect(env)
  const post = await api.upsertStagedPost(env.postSlug)
  await api.publishStagedPostBody(
    post.id,
    'This post is staged by the Playwright acceptance run. Its authored language is Arabic.',
  )
  await api.resetGeneral()

  return async () => {
    try {
      await api.deletePost(post.id)
    } catch (error) {
      console.warn(`[browser] teardown: could not remove staged post: ${String(error)}`)
    }
    try {
      await api.resetGeneral()
    } catch (error) {
      console.warn(`[browser] teardown: could not restore general settings: ${String(error)}`)
    }
  }
}
