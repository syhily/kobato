import type { PublicWebmentionWire } from '@kobato/shared/contracts/webmentions'

import { useSiteIdentity } from '@kobato/shared/lib/blog-config-context'
import { formatLocalDate } from '@kobato/shared/utils/formatter'
import { tryParseUrl } from '@kobato/shared/utils/safe-url'

/** Author line falls back to the source hostname when the source page
 *  exposed no author metadata. */
function authorLabel(mention: PublicWebmentionWire): string {
  if (mention.authorName !== null && mention.authorName !== '') {
    return mention.authorName
  }
  return tryParseUrl(mention.sourceUrl)?.hostname ?? mention.sourceUrl
}

function WebmentionCard({ mention }: { mention: PublicWebmentionWire }) {
  const config = useSiteIdentity()
  return (
    <li className="border-b border-border/60 py-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-medium">{authorLabel(mention)}</span>
        <time dateTime={mention.createdAt} className="text-xs text-ink-4 tabular-nums">
          {formatLocalDate(new Date(mention.createdAt), 'yyyy-MM-dd', config)}
        </time>
      </div>
      <a
        href={mention.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="text-link mt-1 inline-block break-all hover:underline"
      >
        {mention.title ?? mention.sourceUrl}
      </a>
      {mention.summary !== null && <p className="mt-1 line-clamp-2 text-sm text-ink-3">{mention.summary}</p>}
    </li>
  )
}

/** Compact group for the lightweight interactions (likes / reposts):
 *  a row of linked author names instead of full cards — there is no
 *  title or summary worth a card on a bare like. */
function CompactGroup({ label, mentions }: { label: string; mentions: PublicWebmentionWire[] }) {
  if (mentions.length === 0) {
    return null
  }
  return (
    <div className="mt-6">
      <div className="mb-2 text-sm font-semibold">
        {label} <small className="font-theme text-xs">({mentions.length})</small>
      </div>
      <p className="text-sm text-ink-3">
        {mentions.map((mention, index) => (
          <span key={mention.id}>
            {index > 0 && '、'}
            <a href={mention.sourceUrl} target="_blank" rel="noreferrer" className="text-link hover:underline">
              {authorLabel(mention)}
            </a>
          </span>
        ))}
      </p>
    </div>
  )
}

/**
 * 「引用与回应」— approved webmentions under a post/page, grouped by the
 * mf2 response type: replies and plain mentions render as cards, likes
 * and reposts as compact author rows. Pure props and SSR-only (no client
 * interaction, matching the zero-JS-dependency rule for public display
 * blocks). Renders no DOM at all when there is nothing approved to show.
 */
export function WebmentionList({ mentions }: { mentions: PublicWebmentionWire[] }) {
  if (mentions.length === 0) {
    return null
  }
  const cards = mentions.filter((mention) => mention.type === 'mention' || mention.type === 'reply')
  const likes = mentions.filter((mention) => mention.type === 'like')
  const reposts = mentions.filter((mention) => mention.type === 'repost')
  return (
    <section id="webmentions" className="pt-12" aria-label="引用与回应">
      <div className="mb-6 text-xl leading-body font-semibold">
        引用与回应 <small className="font-theme text-sm">({mentions.length})</small>
      </div>
      {cards.length > 0 && (
        <ul>
          {cards.map((mention) => (
            <WebmentionCard key={mention.id} mention={mention} />
          ))}
        </ul>
      )}
      <CompactGroup label="喜欢" mentions={likes} />
      <CompactGroup label="转发" mentions={reposts} />
    </section>
  )
}
