import type { SerializedLexicalNode, SerializedRootNode } from 'lexical'

import type { InklingBlockNode, InklingNonRecursiveBlockNode, InklingRootNode } from '@/shared/inkling/schema'

/**
 * Lexical ↔ Inkling type bridge.
 *
 * Inkling block nodes and Lexical serialised nodes are structurally
 * identical JSON trees (`type`, `version`, `children`).  The types live
 * in separate packages with independent type hierarchies, so TypeScript
 * cannot see the structural compatibility on its own.
 *
 * We bridge the gap via `unsafeCast` — the single point where we assert
 * that the runtime shapes match.  The Inkling schema validates at the
 * persistence boundary; re-validating with Zod inside the editor hot-path
 * would be redundant and expensive.
 */

/** Single bridge point — both type trees are isomorphic JSON. */
function cast<T>(value: unknown): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as unknown as T
}

// ---------------------------------------------------------------------------
// Inkling → Lexical
// ---------------------------------------------------------------------------

export function toLexicalChildren(
  children: readonly InklingBlockNode[] | readonly InklingNonRecursiveBlockNode[],
): SerializedLexicalNode[] {
  return cast(children)
}

export function toSerializedRoot(root: InklingRootNode): SerializedRootNode {
  return cast(root)
}

// ---------------------------------------------------------------------------
// Lexical → Inkling
// ---------------------------------------------------------------------------

export function fromLexicalChildren(children: readonly SerializedLexicalNode[]): InklingNonRecursiveBlockNode[] {
  return cast(children)
}

export function toBlockChildren(children: readonly SerializedLexicalNode[]): InklingBlockNode[] {
  return cast(children)
}
