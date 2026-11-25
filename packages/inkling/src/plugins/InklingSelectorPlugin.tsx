import GifPlugin from '@kobato/inkling-internal/components/ui/GifPlugin'
import LibraryPlugin from '@kobato/inkling-internal/components/ui/LibraryPlugin'
import {
  OPEN_GIF_SELECTOR_COMMAND,
  OPEN_IMAGE_LIBRARY_COMMAND,
} from '@kobato/inkling-internal/nodes/cards/card-commands'
import { $createImageNode, ImageNode } from '@kobato/inkling-internal/nodes/ImageNode'
import { INSERT_CARD_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/commands'
import { registerSelectorInsertCommands } from '@kobato/inkling-internal/plugins/behaviour/selector-insertion'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister, COMMAND_PRIORITY_LOW } from 'lexical'
import { useEffect } from 'react'
const SELECTOR_OPEN_COMMANDS = [
  [OPEN_GIF_SELECTOR_COMMAND, GifPlugin],
  [OPEN_IMAGE_LIBRARY_COMMAND, LibraryPlugin],
] as const
export const InklingSelectorPlugin = () => {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([ImageNode])) {
      return
    }
    return mergeRegister(
      ...SELECTOR_OPEN_COMMANDS.map(([command, Selector]) =>
        editor.registerCommand(
          command,
          (dataset) => {
            const cardNode = $createImageNode({
              ...dataset,
              selector: Selector,
              isImageHidden: true,
            })

            editor.dispatchCommand(INSERT_CARD_COMMAND, { cardNode })

            return true
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
      registerSelectorInsertCommands(editor),
    )
  }, [editor])

  return null
}

export default InklingSelectorPlugin
