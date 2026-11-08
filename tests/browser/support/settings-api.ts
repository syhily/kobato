// Authenticated HTTP staging for the browser journeys — sign-in, settings
// patches, and the staged post. Same wire the HTTP e2e suite uses
// (`#/_helpers/e2e-client` + `#/_helpers/e2e-rpc`), so the journeys never read
// a real config or reach for a private database seam.

import type { BrowserEnv } from './env'

import { E2eClient, getAdminCsrfToken, loginAdmin } from '../../_helpers/e2e-client'
import { callE2eRpc } from '../../_helpers/e2e-rpc'
import { lexicalBodyWith, lexicalParagraph } from '../../_helpers/lexical'

/** Deterministic site state every journey starts from (restored after each test). */
export const BASELINE_GENERAL = {
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  title: 'Kobato Browser Acceptance',
  description: 'Browser acceptance baseline',
} as const

/** The staged post carries both journey fixtures: comments enabled (composer
 *  activation) and a non-Latin `contentLanguage` (body `lang`/`dir`). */
export const STAGED_POST = {
  title: 'Browser Acceptance Post',
  summary: 'Staged by the Playwright global setup.',
  contentLanguage: 'ar',
  commentsEnabled: true,
} as const

export interface StagedPost {
  id: string
  slug: string
}

interface UpsertPostOutput {
  post: StagedPost
}

export class SettingsApi {
  private constructor(
    private readonly client: E2eClient,
    private readonly csrfToken: string,
  ) {}

  static async connect(env: BrowserEnv): Promise<SettingsApi> {
    const client = new E2eClient(env.baseUrl)
    const { res } = await loginAdmin(client, {
      baseUrl: env.baseUrl,
      adminEmail: env.adminEmail,
      adminPassword: env.adminPassword,
    })
    if (res.status !== 302) {
      throw new Error(`admin sign-in returned ${res.status}, expected 302 — check KOBATO_BROWSER_ADMIN_*`)
    }
    const csrfToken = await getAdminCsrfToken(client)
    return new SettingsApi(client, csrfToken)
  }

  async updateGeneral(payload: Record<string, unknown>): Promise<void> {
    const result = await callE2eRpc<{ section: unknown }>(
      this.client,
      '/admin/settings/update',
      { section: 'general', payload },
      this.csrfToken,
    )
    if (result.status !== 200) {
      throw new Error(`settings update failed (${result.status}) for ${JSON.stringify(Object.keys(payload))}`)
    }
  }

  resetGeneral(): Promise<void> {
    return this.updateGeneral(BASELINE_GENERAL)
  }

  async deletePost(id: string): Promise<void> {
    const result = await callE2eRpc<unknown>(this.client, '/admin/posts/delete', { id }, this.csrfToken)
    if (result.status !== 200) {
      throw new Error(`post removal failed (${result.status})`)
    }
  }

  async upsertStagedPost(slug: string): Promise<StagedPost> {
    const result = await callE2eRpc<UpsertPostOutput>(
      this.client,
      '/admin/posts/upsertMeta',
      {
        ...STAGED_POST,
        slug,
        published: true,
        publishedAt: new Date().toISOString(),
      },
      this.csrfToken,
    )
    if (result.status !== 200) {
      throw new Error(`staged post upsert failed (${result.status})`)
    }
    return result.json.post
  }

  /** Save and publish a real body — an empty body renders a zero-height
   *  container (and the public page shows the draft badge). */
  async publishStagedPostBody(id: string, prose: string): Promise<void> {
    const body = lexicalBodyWith([lexicalParagraph(prose)])
    const draft = await callE2eRpc<{ status: string }>(
      this.client,
      '/admin/posts/saveDraft',
      { id, body },
      this.csrfToken,
    )
    if (draft.status !== 200 || draft.json.status !== 'saved') {
      throw new Error(`staged post draft save failed (${draft.status})`)
    }
    const published = await callE2eRpc<{ status: string }>(
      this.client,
      '/admin/posts/publishLatest',
      { id, body, publishedAt: new Date().toISOString() },
      this.csrfToken,
    )
    if (published.status !== 200 || published.json.status !== 'saved') {
      throw new Error(`staged post publish failed (${published.status})`)
    }
  }
}
