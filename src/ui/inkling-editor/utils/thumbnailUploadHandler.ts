import { $getNodeByKey, type LexicalEditor, type NodeKey } from 'lexical'

import { GeneratedDecoratorNodeBase } from '@/ui/inkling-editor/nodes/base'

type UploadFn = (
  files: FileList | File[],
  options?: { formData?: Record<string, string> },
) => Promise<Array<{ url?: string }> | undefined>

export const thumbnailUploadHandler = async (
  files: FileList | File[] | null,
  nodeKey: NodeKey,
  editor: LexicalEditor,
  upload: UploadFn,
): Promise<void> => {
  if (!files) {
    return
  }

  let mediaSrc = ''

  editor.getEditorState().read(() => {
    const node = $getNodeByKey(nodeKey)
    if (node) {
      mediaSrc = (node as GeneratedDecoratorNodeBase).src as string
    }
  })

  const uploadResult = await upload(files, { formData: { url: mediaSrc } })

  await editor.update(() => {
    const node = $getNodeByKey(nodeKey)
    if (node && uploadResult?.[0]?.url) {
      ;(node as GeneratedDecoratorNodeBase).thumbnailSrc = uploadResult[0].url
    }
  })

  return
}
