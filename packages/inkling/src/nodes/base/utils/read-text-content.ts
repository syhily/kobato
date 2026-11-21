import { $getRoot } from 'lexical'

export default function readTextContent(node: Record<string, unknown>, property: string) {
  const propertyName = `__${property}`
  const propertyEditorName = `${propertyName}Editor`

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
