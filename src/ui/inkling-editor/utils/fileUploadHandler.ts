import { $getNodeByKey, type LexicalEditor, type NodeKey } from 'lexical'

import { GeneratedDecoratorNodeBase } from '@/ui/inkling-editor/nodes/base'

export const stripFileExtension = (fileName: string): string => {
  const fileExtension = fileName.split('.').pop() ?? ''
  const fileNameWithoutExtension = fileName.replace(`.${fileExtension}`, '')
  return fileNameWithoutExtension
}

type UploadFn = (files: FileList | File[]) => Promise<Array<{ url?: string }> | undefined>

export const fileUploadHandler = async (
  files: FileList | File[] | null,
  nodeKey: NodeKey,
  editor: LexicalEditor,
  upload: UploadFn,
): Promise<void> => {
  if (!files) {
    return
  }
  const result = await upload(files)

  // upload() resolves to null when the upload fails (e.g. a host limit or
  // validation error). Bail out so we don't throw trying to read the result,
  // and so the card falls back to its empty state where the error is shown.
  if (!result || !result[0]) {
    return
  }

  const meta = files
  const fileName = meta[0]?.name
  const fileSize = meta[0]?.size
  const src = result[0]?.url

  const dataset = {
    fileName: fileName ?? '',
    fileSize: fileSize ?? 0,
    src: src ?? '',
  }
  await editor.update(() => {
    const node = $getNodeByKey(nodeKey)
    if (node) {
      const n = node as GeneratedDecoratorNodeBase
      n.fileTitle = stripFileExtension(dataset.fileName)
      n.fileName = dataset.fileName
      n.fileSize = dataset.fileSize
      n.src = dataset.src
    }
  })

  return
}
