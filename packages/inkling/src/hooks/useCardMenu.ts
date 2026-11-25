import type {
  BuildCardMenuResult,
  CardMenuInsertParams,
  CardMenuSource,
  MenuBuildConfig,
} from '@kobato/inkling-internal/nodes/cards/card-menu-build'
import type { AnyLexicalCommand, LexicalEditor } from 'lexical'

import {
  useInklingGifSettings,
  useInklingLibrarySettings,
  useInklingSnippetSettings,
} from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import { lookupLabel } from '@kobato/inkling-internal/labels/inkling-labels'
import { buildCardMenu } from '@kobato/inkling-internal/nodes/cards/card-menu-build'
import { getEditorCardNodes } from '@kobato/inkling-internal/nodes/cards/editor-card-nodes'
import { TABLE_MENU_SOURCE } from '@kobato/inkling-internal/nodes/table/table-menu'
import { $swapTriggerParagraph } from '@kobato/inkling-internal/plugins/behaviour/card-menu-trigger'
import { TableNode } from '@lexical/table'
import { useCallback, useContext, useMemo } from 'react'
export type CardMenuInsert = (insertCommand: AnyLexicalCommand, params?: CardMenuInsertParams) => void

export interface UseCardMenuOptions {
  commandParams?: string[]
  replaceTriggerParagraph?: boolean
}
export interface UseCardMenu {
  cardMenu: BuildCardMenuResult
  insert: CardMenuInsert
}

export function useCardMenu(editor: LexicalEditor, query?: string, options: UseCardMenuOptions = {}): UseCardMenu {
  const { commandParams = [], replaceTriggerParagraph = false } = options
  const gifSettings = useInklingGifSettings()
  const snippetSettings = useInklingSnippetSettings()
  const librarySettings = useInklingLibrarySettings()
  const { labels } = useContext(InklingUiPrefsContext)

  const menuConfig = useMemo<MenuBuildConfig>(
    () => ({
      tenor: gifSettings.tenor,
      klipy: gifSettings.klipy,
      snippets: snippetSettings.snippets,
      deleteSnippet: snippetSettings.deleteSnippet,
      imageLibrary: librarySettings.imageLibrary,
    }),
    [
      gifSettings.tenor,
      gifSettings.klipy,
      snippetSettings.snippets,
      snippetSettings.deleteSnippet,
      librarySettings.imageLibrary,
    ],
  )

  const cardMenu = useMemo<BuildCardMenuResult>(() => {
    const cardNodes = getEditorCardNodes(editor)

    const nodes: Iterable<[string, CardMenuSource]> = editor.hasNode(TableNode)
      ? [...cardNodes, TABLE_MENU_SOURCE]
      : cardNodes
    const resolveLabel = (key: string, fallback: string) => lookupLabel(labels, key, fallback)
    return buildCardMenu(nodes, { query, config: menuConfig, resolveLabel })
  }, [editor, query, menuConfig, labels])
  const insert = useCallback<CardMenuInsert>(
    (insertCommand, { insertParams = {}, queryParams = [] } = {}) => {
      const dataset = { ...insertParams }

      for (let i = 0; i < queryParams.length; i++) {
        if (commandParams[i] !== undefined) {
          const key = queryParams[i]
          const value = commandParams[i]
          dataset[key] = value
        }
      }

      const dispatch = () => editor.dispatchCommand(insertCommand, dataset)

      if (!replaceTriggerParagraph) {
        dispatch()
        return
      }

      editor.update(() => {
        $swapTriggerParagraph(dispatch)
      })
    },
    [editor, commandParams, replaceTriggerParagraph],
  )

  return { cardMenu, insert }
}
