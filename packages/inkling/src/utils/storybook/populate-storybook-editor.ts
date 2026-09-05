import type { LexicalEditor } from 'lexical'

import generateEditorState from '@/utils/generateEditorState'

export default function populateEditor({ editor, initialHtml }: { editor: LexicalEditor; initialHtml: string }) {
  generateEditorState({ editor, initialHtml })
}
