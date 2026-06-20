import type { SerializedLexicalNode, SerializedRootNode } from 'lexical'

import type { InklingBlockNode, InklingNonRecursiveBlockNode, InklingRootNode } from '@/shared/inkling/schema'

/**
 * Lexical bridge helpers for the Inkling editor.
 *
 * Inkling block nodes are structurally compatible with Lexical serialised
 * nodes — both are JSON trees with `type`, `version`, `children`, etc.
 * The Inkling schema validates the shape at the persistence boundary;
 * these casts bridge the isomorphic type gap between the two JSON trees
 * at the editor boundary where full Zod re-validation would be redundant.
 */

/**
 * Cast Inkling block children to Lexical serialised nodes.
 * Callers that need a deep copy should pass the result through
 * `structuredClone` themselves.
 */
export function toLexicalChildren(
  children: readonly InklingBlockNode[] | readonly InklingNonRecursiveBlockNode[],
): SerializedLexicalNode[] {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return children as unknown as SerializedLexicalNode[]
}

/**
 * Cast Lexical serialised node children back to Inkling non-recursive blocks.
 * Only safe when the editor is configured with the restricted node subset
 * that maps 1:1 to Inkling non-recursive blocks.
 */
export function fromLexicalChildren(children: readonly SerializedLexicalNode[]): InklingNonRecursiveBlockNode[] {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return children as unknown as InklingNonRecursiveBlockNode[]
}

/**
 * Cast Lexical serialised node children back to Inkling blocks (full union
 * including recursive types).  Used by editorStateToInklingDocument where
 * the editor registers all article nodes.
 */
export function toBlockChildren(children: readonly SerializedLexicalNode[]): InklingBlockNode[] {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return children as unknown as InklingBlockNode[]
}

/**
 * Cast an Inkling-shaped root to Lexical's SerializedRootNode.
 * Used when stripping footnote-definition blocks to produce a prose-only
 * editor state.  The shapes are structurally compatible.
 */
export function toSerializedRoot(root: InklingRootNode): SerializedRootNode {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return root as unknown as SerializedRootNode
}
