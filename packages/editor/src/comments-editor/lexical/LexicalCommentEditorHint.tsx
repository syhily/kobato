/**
 * Hint strip of the Lexical comment editor — copy of the tiptap
 * `CommentEditorHint` copy (self-contained so the R6 switch can delete
 * the tiptap track without touching this one).
 */
export function LexicalCommentEditorHint() {
  return (
    <div className="border-t border-line/60 px-3 py-1.5 text-xs text-ink-4">
      输入 <code>/</code> 块级命令，<code>$</code> 内联公式。
    </div>
  )
}
