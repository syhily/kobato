import type { NodeKey } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

import type { DefaultHeaderTypes, InsertImagePayload } from '@/ui/inkling-editor/unsplash/UnsplashTypes'

import UnsplashModal from '@/ui/inkling-editor/components/ui/file-selectors/UnsplashModal'
import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import { DELETE_CARD_COMMAND } from '@/ui/inkling-editor/plugins/InklingBehaviourPlugin'
import { INSERT_FROM_UNSPLASH_COMMAND } from '@/ui/inkling-editor/plugins/InklingSelectorPlugin'

interface UnsplashPluginProps {
  nodeKey: NodeKey
}

export function UnsplashPlugin({ nodeKey }: UnsplashPluginProps) {
  const [editor] = useLexicalComposerContext()
  const { cardConfig } = React.useContext(InklingComposerContext)

  const onClose = React.useCallback(() => {
    editor.dispatchCommand(DELETE_CARD_COMMAND, { cardKey: nodeKey })
  }, [editor, nodeKey])

  const onImageInsert = React.useCallback(
    (image: InsertImagePayload) => {
      editor.dispatchCommand(INSERT_FROM_UNSPLASH_COMMAND, {
        src: image.src,
        width: image.width,
        height: image.height,
        alt: image.alt,
        caption: image.caption,
      })
    },
    [editor],
  )

  return (
    <UnsplashModal
      onClose={onClose}
      onImageInsert={onImageInsert}
      unsplashConf={(cardConfig?.unsplash as DefaultHeaderTypes | undefined) ?? null}
    />
  )
}

export default UnsplashPlugin
