import { $getNodeByKey, type LexicalEditor, type NodeKey } from 'lexical'

import { GeneratedDecoratorNodeBase } from '@/ui/inkling-editor/nodes/base'
import { getAudioMetadata } from '@/ui/inkling-editor/utils/getAudioMetadata'
import prettifyFileName from '@/ui/inkling-editor/utils/prettifyFileName'

type UploadFn = (files: FileList | File[]) => Promise<Array<{ url?: string }> | undefined>

export const audioUploadHandler = async (
  files: FileList | File[] | null,
  nodeKey: NodeKey,
  editor: LexicalEditor,
  upload: UploadFn,
): Promise<void> => {
  if (!files) {
    return
  }

  // perform the actual upload
  const result = await upload(files)
  const fileSrc = result?.[0]?.url

  if (!fileSrc) {
    return
  }

  // grab basic metadata from the file directly
  const filename = files[0].name
  const title = prettifyFileName(filename)

  // read file into an object URL so we can grab extra metadata
  const objectURL = URL.createObjectURL(files[0])
  const mimeType = files[0].type
  const { duration } = await getAudioMetadata(objectURL)

  await editor.update(() => {
    const node = $getNodeByKey(nodeKey)
    if (node) {
      const n = node as GeneratedDecoratorNodeBase
      n.duration = duration
      n.src = fileSrc
      n.mimeType = mimeType
      n.title = title
    }
  })

  return
}
