import { $getRoot } from 'lexical'

// when used nodes are used client-side their data attributes may be an editor
// instance rather than a string in the case of nested editors
export default function readTextContent(node: Record<string, unknown>, property: string) {
  const propertyName = `__${property}`
  const propertyEditorName = `${propertyName}Editor`

  // prefer the editor if it exists as the underlying value isn't written until export
  const value = node[propertyEditorName] || node[propertyName]

  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number') {
    return value.toString()
  }

  // the editor case: nested editors are created by `createEditor` and stored
  // on the node (`@/nodes/nested-editors`). Lexical 0.46 exports no
  // editor-class value to instanceof against, so prove each call shape
  // before invoking instead of asserting the whole chain
  if (typeof value === 'object' && value !== null && 'getEditorState' in value) {
    const { getEditorState } = value
    if (typeof getEditorState !== 'function') {
      return ''
    }

    const editorState: unknown = getEditorState.call(value)
    if (typeof editorState !== 'object' || editorState === null || !('read' in editorState)) {
      return ''
    }

    const { read } = editorState
    if (typeof read !== 'function') {
      return ''
    }

    let text = ''
    read.call(editorState, () => {
      text = $getRoot().getTextContent()
    })

    return text
  }

  return ''
}
