import type { SerializedLexicalNode, SerializedRootNode } from 'lexical'

import type { InklingBlockNode, InklingNonRecursiveBlockNode, InklingRootNode } from '@/shared/inkling/schema'

/**
 * Lexical ↔ Inkling type bridge.
 *
 * Inkling block nodes and Lexical serialised nodes share an identical JSON
 * shape (`type`, `version`, `children`, etc.).  The Inkling schema validates
 * the full tree at the persistence boundary; re-validating with Zod inside
 * the editor hot-path (serialize / deserialize per keystroke) would be
 * redundant and expensive.
 *
 * These helpers bridge the nominal type gap.  Dev-mode structural assertions
 * catch mismatches early without production overhead.
 */

// ---------------------------------------------------------------------------
// Internal: single unsafe cast, guarded by dev-mode structural checks
// ---------------------------------------------------------------------------

/** Shallow-check that every element in an array is a plain object with a
 *  `type` property — the common structural denominator between Inkling
 *  block nodes and Lexical serialised nodes.  Only runs in dev mode. */
function assertNodeArray(arr: readonly unknown[]): void {
  if (import.meta.env.DEV) {
    for (const el of arr) {
      if (typeof el !== 'object' || el === null || !('type' in el)) {
        throw new Error('lexical-bridge: expected object with type property')
      }
    }
  }
}

/** Single point for the Inkling ↔ Lexical structural cast.  The two type
 *  trees are isomorphic JSON; the dev-mode checks above and in each caller
 *  validate the structural contract at runtime. */
function unsafeCast<T>(value: unknown): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as unknown as T
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Inkling children → Lexical serialised nodes (editor input direction). */
export function toLexicalChildren(
  children: readonly InklingBlockNode[] | readonly InklingNonRecursiveBlockNode[],
): SerializedLexicalNode[] {
  assertNodeArray(children)
  return unsafeCast(children)
}

/** Lexical children → Inkling non-recursive blocks (restricted nested-editor
 *  output direction).  Only valid when the editor registers the restricted
 *  node subset that maps 1:1 to non-recursive blocks. */
export function fromLexicalChildren(children: readonly SerializedLexicalNode[]): InklingNonRecursiveBlockNode[] {
  assertNodeArray(children)
  return unsafeCast(children)
}

/** Lexical children → Inkling full block union (article-editor output
 *  direction).  Used by `editorStateToInklingDocument`. */
export function toBlockChildren(children: readonly SerializedLexicalNode[]): InklingBlockNode[] {
  assertNodeArray(children)
  return unsafeCast(children)
}

/** Inkling root node → Lexical SerializedRootNode.  Used when stripping
 *  footnote-definition blocks to produce a prose-only editor state. */
export function toSerializedRoot(root: InklingRootNode): SerializedRootNode {
  if (import.meta.env.DEV) {
    if (typeof root !== 'object' || root === null || root.type !== 'root') {
      throw new Error('lexical-bridge: expected root node')
    }
  }
  return unsafeCast(root)
}
