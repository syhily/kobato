// oxlint-disable-next-line typescript/no-explicit-any
export function getEditorCardNodes(editor: any) {
  // TODO: open upstream PR to add public method of getting nodes
  const allNodes = editor._nodes
  // oxlint-disable-next-line typescript/no-explicit-any
  const cardNodes: any[] = []

  for (const [nodeType, { klass }] of allNodes) {
    if (!klass.kgMenu) {
      continue
    }

    cardNodes.push([nodeType, klass])
  }

  return cardNodes
}
