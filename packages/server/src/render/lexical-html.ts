import type { MusicEmbedResolver } from '@kobato/server/domains/lexical/embeds'
import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { lexicalBodyToHtml, type LexicalMusicMeta } from '@kobato/server/render/lexical-html/lexicalBodyToHtml'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'
import { collectMusicPlayerIds } from '@kobato/shared/lexical/walk'
import { resolveFootnotesSectionTitle } from '@kobato/shared/utils/footnotes-section-title'
import { joinUrl } from '@kobato/shared/utils/urls'

// Server-side assembly for the Lexical string renderer. Feed and other
// string sinks reach the renderer through these seams — heading slugs,
// music embeds, and the settings-driven footnotes section title.
//
// Music metas arrive through the lexical embed seam
// (`@kobato/server/domains/lexical/embeds`) and relative covers are
// absolutized for feed consumption; `rssMode` selects the string
// renderer's classless degraded branch.

export interface RenderLexicalBodyToHtmlOptions {
  rssMode?: boolean
}

export async function renderLexicalBodyToHtml(
  body: LexicalBody,
  headingSlugs: readonly string[],
  resolveMusicEmbeds: MusicEmbedResolver,
  options: RenderLexicalBodyToHtmlOptions = {},
): Promise<string> {
  const musicByPlayerId = await resolveMusicPlayerMeta(body, resolveMusicEmbeds)
  return lexicalBodyToHtml(body, {
    headingSlugs,
    mode: options.rssMode === true ? 'rss' : 'default',
    musicMeta: (playerId) => musicByPlayerId.get(playerId),
    footnotesSectionTitle: resolveFootnotesSectionTitle(requireBlogSettingsSection('content')),
  })
}

async function resolveMusicPlayerMeta(
  body: LexicalBody,
  resolveMusicEmbeds: MusicEmbedResolver,
): Promise<Map<string, LexicalMusicMeta>> {
  const playerIds = collectMusicPlayerIds(body)
  if (playerIds.length === 0) {
    return new Map()
  }

  const metas = await resolveMusicEmbeds(playerIds)
  const map = new Map<string, LexicalMusicMeta>()
  for (const [playerId, meta] of metas) {
    map.set(playerId, { name: meta.name, artist: meta.artist, audioUrl: meta.url, cover: absolutizeForFeed(meta.pic) })
  }
  return map
}

// Feed readers resolve URLs on a different origin, so a relative cover URL
// (the bundled default music cover) is joined with the site origin — the
// same way the feed generator absolutizes `/logo.svg`. Storage URLs already
// arrive absolute (`resolveAssetUrl` joins the CDN base or the site origin).
function absolutizeForFeed(url: string): string {
  if (!url.startsWith('/')) {
    return url
  }
  return joinUrl(requireBlogSettingsSection('siteIdentity').website, url)
}
