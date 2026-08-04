import type { LexicalElementBase } from '@kobato/shared/lexical/schema'

import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'

// Pure-JSON normalization for Lexical QUOTE nodes. The 0.45
// `$setBlocksType(selection, () => $createQuoteNode())` conversion moves
// the paragraph's inline children DIRECTLY into the `quote`, so a
// freshly-created quote serializes as `quote.children = [text,
// linebreak, link, …]` — while the pinned dialect (both the body and
// the comment schema) requires `quote.children` to be paragraphs (the
// shape the PT→Lexical mapping emits; `QuoteNode` — unlike
// `ListItemNode` — does NOT unwrap paragraphs on parse, so the wrapped
// form round-trips).
//
// This module rewrites every `quote` in a tree so that runs of bare
// inline children are wrapped into paragraphs. Deterministic and
// idempotent, so it can run before the zod gates (the canonicalize
// entry points) AND on reload; non-object / malformed input passes
// through untouched — the zod gate stays the rejector.
//
// ListItemNode is deliberately NOT normalized: 0.45's `append` unwraps
// paragraphs inside list items, so the runtime shape there is inline
// children (plus nested lists) — the comment dialect accepts both forms
// and the canonicalize parse round-trip narrows the paragraph alias away
// via the parse round-trip. Both canonicalize entry points (body and
// comment) run this module before their zod gates.

const PARAGRAPH_BASE: LexicalElementBase = {
  direction: null,
  format: '',
  indent: 0,
  version: 1,
}

/** True when the value looks like a paragraph node. */
function isParagraph(node: unknown): boolean {
  if (typeof node !== 'object' || node === null) {
    return false
  }
  return unsafeCast<Record<string, unknown>>(node).type === 'paragraph'
}

/** Wrap a run of bare inline children into a dialect paragraph node. */
function inlineRunToParagraph(run: unknown[]): Record<string, unknown> {
  return {
    ...PARAGRAPH_BASE,
    type: 'paragraph',
    textFormat: 0,
    textStyle: '',
    children: run,
  }
}

/** Rewrite one quote's children: inline runs → paragraphs, paragraphs pass through. */
function normalizeQuoteChildren(children: unknown[]): unknown[] {
  const out: unknown[] = []
  let run: unknown[] = []
  const flush = () => {
    if (run.length === 0) {
      return
    }
    out.push(inlineRunToParagraph(run))
    run = []
  }
  for (const child of children) {
    if (isParagraph(child)) {
      flush()
      out.push(child)
    } else {
      run.push(child)
    }
  }
  flush()
  return out
}

function normalizeNode(node: unknown): unknown {
  if (typeof node !== 'object' || node === null) {
    return node
  }
  const record = unsafeCast<Record<string, unknown>>(node)
  if (!Array.isArray(record.children)) {
    return node
  }
  if (record.type === 'quote') {
    return { ...record, children: normalizeQuoteChildren(record.children) }
  }
  return { ...record, children: record.children.map(normalizeNode) }
}

/**
 * Rewrite every quote in the tree to the dialect children shape
 * (paragraphs only). Idempotent; malformed input passes through for the
 * zod gate to reject.
 */
export function normalizeLexicalQuoteChildren(value: unknown): unknown {
  // The serialized body wrapper `{root: {children}}` — descend into the
  // root node before walking (the node walker expects a node with a
  // `children` array).
  if (typeof value === 'object' && value !== null) {
    const record = unsafeCast<Record<string, unknown>>(value)
    if (
      typeof record.root === 'object' &&
      record.root !== null &&
      Array.isArray(unsafeCast<Record<string, unknown>>(record.root).children)
    ) {
      return { ...record, root: normalizeNode(record.root) }
    }
  }
  return normalizeNode(value)
}
