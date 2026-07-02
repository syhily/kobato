import type { LexicalEditor } from 'lexical'

/**
 * Temporary no-op stubs while the hand-rolled editor is replaced by the
 * vendored inkling source (Task 1 of the vendor migration plan). The real
 * insert helpers return with the ported card nodes in Task 7.
 */
export function insertCommentCodeBlock(editor: LexicalEditor): void {
  void editor
}

export function insertCommentMathBlock(editor: LexicalEditor): void {
  void editor
}
