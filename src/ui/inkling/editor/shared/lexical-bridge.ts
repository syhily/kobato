import type { SerializedLexicalNode, SerializedRootNode } from 'lexical'

import type { InklingBlockNode, InklingNonRecursiveBlockNode, InklingRootNode } from '@/shared/inkling/schema'

import { unsafeCast } from '@/shared/utils/unsafe-cast'

/**
 * Lexical ↔ Inkling type bridge.
 *
 * Inkling block nodes and Lexical serialised nodes are structurally
 * identical JSON trees (`type`, `version`, `children`).  The types live
 * in separate packages with independent type hierarchies, so TypeScript
 * cannot see the structural compatibility.
 *
 * We bridge the gap via `unsafeCast` — a single shared utility whose
 * `oxlint-disable` serves the entire codebase.  The Inkling schema
 * validates at the persistence boundary; re-validating with Zod inside
 * the editor hot-path would be redundant.
 */

// ---------------------------------------------------------------------------
// Inkling → Lexical
// ---------------------------------------------------------------------------

export function toLexicalChildren(
  children: readonly InklingBlockNode[] | readonly InklingNonRecursiveBlockNode[],
): SerializedLexicalNode[] {
  return unsafeCast(children)
}

export function toSerializedRoot(root: InklingRootNode): SerializedRootNode {
  return unsafeCast(root)
}

// ---------------------------------------------------------------------------
// Lexical → Inkling
// ---------------------------------------------------------------------------

export function fromLexicalChildren(children: readonly SerializedLexicalNode[]): InklingNonRecursiveBlockNode[] {
  return unsafeCast(children)
}

export function toBlockChildren(children: readonly SerializedLexicalNode[]): InklingBlockNode[] {
  return unsafeCast(children)
}
