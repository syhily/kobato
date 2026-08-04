import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'

// Pure-JSON rewrite for AUTOLINK nodes (the `@lexical/link` AutoLinkNode
// / `@lexical/extension` autolink extension's serialized form). 0.45's
// autolink nodes serialize exactly like LinkNode except for `type:
// 'autolink'` — same `url` / `rel` / `target` / `title` fields and
// children. The pinned dialect does NOT admit an `autolink` type (the
// editor-track registration is pending; the server perimeter rejects
// unknown types), so canonicalization rewrites every autolink into a
// regular LinkNode whose `url` is the node's own URL — the autolink text
// IS the URL, matching `@lexical/link`'s recommended
// `$createLinkNode(url)` conversion.
//
// This is a pre-gate normalization (same role as
// `normalizeLexicalQuoteChildren`): it runs before the zod gates, only
// touches nodes whose `type` is exactly `autolink`, and passes everything
// else through untouched — malformed input still fails validation.
// Deterministic and idempotent (a converted link node is never
// re-matched).

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function rewriteNode(node: unknown): unknown {
  if (!isRecord(node)) {
    return node
  }
  if (!Array.isArray(node.children)) {
    return node
  }
  const children = node.children.map(rewriteNode)
  if (node.type === 'autolink') {
    return { ...node, type: 'link', children }
  }
  return { ...node, children }
}

/**
 * Rewrite every `autolink` node in the tree into a `link` node. Idempotent;
 * malformed input passes through for the zod gate to reject.
 */
export function transformAutoLinkToLink(value: unknown): unknown {
  if (!isRecord(value)) {
    return value
  }
  if (isRecord(value.root) && Array.isArray(value.root.children)) {
    return { ...value, root: rewriteNode(value.root) }
  }
  return rewriteNode(value)
}

/** Convenience cast for callers that know the input is a `LexicalBody`/comment body. */
export function transformAutoLinkToLinkBody<T>(value: T): T {
  return unsafeCast<T>(transformAutoLinkToLink(value))
}
