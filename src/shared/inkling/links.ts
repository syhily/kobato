import type { InklingDocument, InklingImageCardNode, InklingLinkNode } from '@/shared/inkling/schema'

import { walkInkling } from '@/shared/inkling/walk'

/**
 * Collect every `link` node URL in the document, in render order. Covers
 * links nested inside paragraphs, headings, quotes, list items, table cells,
 * solution / two-column / footnote-definition children.
 *
 * Used by canonicalization to enforce URL safety at the API perimeter so
 * that `javascript:` / `data:` schemes never reach the DB. Renderers still
 * re-sanitize at the output boundary (defense in depth), but perimeter
 * validation is what prevents the unsafe URL from being persisted in the
 * first place — every API consumer (feed, search snapshot, raw DTO) sees
 * what the editor produced.
 */
export function collectLinkUrls(document: InklingDocument): string[] {
  const urls: string[] = []
  walkInkling(
    document,
    {
      link: (node: InklingLinkNode) => {
        urls.push(node.url)
      },
    },
    undefined,
  )
  return urls
}

/**
 * Collect every `image-card` `src` in the document, in render order. Covers
 * images nested inside recursive containers (solution, two-column,
 * footnote-definition) the same way {@link collectLinkUrls} does.
 *
 * Used by canonicalization to enforce image-URL safety at the API perimeter:
 * a `data:` image accepted on input is silently destroyed at SSR render time
 * (`sanitizeUrl` rewrites it to `#`), so persisting one leaves a permanently
 * broken image in the article. Rejecting `data:` (and other non-http(s)
 * schemes) here keeps the input and output boundaries consistent.
 */
export function collectImageSrcs(document: InklingDocument): string[] {
  const srcs: string[] = []
  walkInkling(
    document,
    {
      image: (node: InklingImageCardNode) => {
        srcs.push(node.src)
      },
    },
    undefined,
  )
  return srcs
}

/**
 * Count `http(s)://` link occurrences in the document. Used by comment
 * canonicalization to enforce a per-comment link-spam limit.
 */
export function countHttpLinks(document: InklingDocument): number {
  let total = 0
  for (const url of collectLinkUrls(document)) {
    if (/^https?:\/\//i.test(url)) {
      total += 1
    }
  }
  return total
}
