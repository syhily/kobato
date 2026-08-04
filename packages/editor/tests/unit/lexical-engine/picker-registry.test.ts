import { OPEN_IMAGE_PICKER_COMMAND, OPEN_MUSIC_PICKER_COMMAND } from '@kobato/editor/engine/lexical/commands'
import { getPickerHandlers, registerPickerHandlers } from '@kobato/editor/engine/lexical/picker-registry'
import { createBodyEditorConfig } from '@kobato/shared/lexical/body-config'
import { createHeadlessEditor } from '@lexical/headless'
import { describe, expect, it, vi } from 'vitest'

// Picker injection surface (R3a): `registerPickerHandlers` bridges the
// editor-internal `OPEN_*` commands to the host callbacks and exposes
// the picker renderers to node views. The reverse direction
// (`INSERT_*` commands) is exercised through the LexicalBodyEditor
// kernel tests.

describe('editor/engine/lexical/picker-registry', () => {
  it('bridges OPEN_* commands to the host callbacks and unregisters', () => {
    const editor = createHeadlessEditor(createBodyEditorConfig())
    const openImage = vi.fn()
    const openMusic = vi.fn()
    const unregister = registerPickerHandlers(editor, { openImagePicker: openImage, openMusicPicker: openMusic })

    editor.dispatchCommand(OPEN_IMAGE_PICKER_COMMAND, undefined)
    editor.dispatchCommand(OPEN_MUSIC_PICKER_COMMAND, undefined)
    expect(openImage).toHaveBeenCalledTimes(1)
    expect(openMusic).toHaveBeenCalledTimes(1)

    unregister()
    editor.dispatchCommand(OPEN_IMAGE_PICKER_COMMAND, undefined)
    editor.dispatchCommand(OPEN_MUSIC_PICKER_COMMAND, undefined)
    expect(openImage).toHaveBeenCalledTimes(1)
    expect(openMusic).toHaveBeenCalledTimes(1)
  })

  it('exposes the renderers to node views via getPickerHandlers', () => {
    const editor = createHeadlessEditor(createBodyEditorConfig())
    const renderImagePicker = () => null
    registerPickerHandlers(editor, {
      openImagePicker: () => {},
      openMusicPicker: () => {},
      renderImagePicker,
    })
    expect(getPickerHandlers(editor)?.renderImagePicker).toBe(renderImagePicker)
    expect(getPickerHandlers(editor)?.renderMusicPicker).toBeUndefined()
  })
})
