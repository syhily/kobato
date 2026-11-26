import { SettingsApi } from '@kobato/pack/browser/settings-api'
import { browserEnv } from '@kobato/pack/instance/client/browser-env'

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
