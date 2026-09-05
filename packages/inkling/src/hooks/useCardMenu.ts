import type { LexicalCommand, LexicalEditor } from 'lexical'

import { TableNode } from '@lexical/table'
import React from 'react'

import type {
  BuildCardMenuResult,
  CardMenuSource,
  MenuBuildConfig,
  ResolvedMenuItem,
} from '@/nodes/cards/card-menu-build'

import {
  useInklingGifSettings,
  useInklingLibrarySettings,
  useInklingSnippetSettings,
} from '@/context/InklingHostIntegrationContext'
import InklingUiPrefsContext from '@/context/InklingUiPrefsContext'
import { lookupLabel } from '@/labels/inkling-labels'
import { buildCardMenu } from '@/nodes/cards/card-menu-build'
import { getEditorCardNodes } from '@/nodes/cards/editor-card-nodes'
import { TABLE_MENU_SOURCE } from '@/nodes/table/table-menu'
import { $swapTriggerParagraph } from '@/plugins/behaviour/card-menu-trigger'

export type CardMenuInsertParams = Pick<ResolvedMenuItem, 'insertParams' | 'queryParams'>

export type CardMenuInsert = (insertCommand: LexicalCommand<unknown>, params?: CardMenuInsertParams) => void

export interface UseCardMenuOptions {
  /** Typed `/card param` values, merged into the dispatch dataset under the
   * item's `queryParams` keys. Slash-menu only — the plus menu has no typed
   * params. */
  commandParams?: string[]
  /** Slash-menu insert semantics: the trigger paragraph still carries the
   * "/query" text, so it is swapped for a fresh paragraph before the insert
   * command dispatches. The plus menu dispatches at the cached caret as-is. */
  replaceTriggerParagraph?: boolean
}

export interface UseCardMenu {
  cardMenu: BuildCardMenuResult
  insert: CardMenuInsert
}

/** The card menu as data: the registered card nodes plus the host's
 * cardConfig resolved through buildCardMenu, and the single type-erased
 * insert dispatch shared by the slash and plus menus. Trigger and
 * positioning semantics stay in CardMenuPopup. */
export function useCardMenu(editor: LexicalEditor, query?: string, options: UseCardMenuOptions = {}): UseCardMenu {
  const { commandParams = [], replaceTriggerParagraph = false } = options
  const gifSettings = useInklingGifSettings()
  const snippetSettings = useInklingSnippetSettings()
  const librarySettings = useInklingLibrarySettings()
  const { labels } = React.useContext(InklingUiPrefsContext)

  // the menu is a cross-feature surface: buildCardMenu gates card entries on
  // the gif/library configs and lists the host's snippets, so the flat
  // `MenuBuildConfig` it consumes is composed from exactly those three
  // channels — an upload/math/linking slice changing never rebuilds the menu
  const menuConfig = React.useMemo<MenuBuildConfig>(
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

  // rebuild the menu when the registered nodes, query, host config, or labels
  // change — buildCardMenu is pure, so the menu is computed during render (no
  // empty first-render frame). The label resolver is the single injection
  // point for labels (C7): declaration labelKeys resolve through the table,
  // snippet/custom items render as declared.
  const cardMenu = React.useMemo<BuildCardMenuResult>(() => {
    const cardNodes = getEditorCardNodes(editor)
    // the table entry is a pseudo CardMenuSource (snippet precedent) — the
    // table family is not a card, so it joins the menu here instead of
    // through the declarations, and only when the editor registers TableNode
    const nodes: Iterable<[string, CardMenuSource]> = editor.hasNode(TableNode)
      ? [...cardNodes, TABLE_MENU_SOURCE]
      : cardNodes
    const resolveLabel = (key: string, fallback: string) => lookupLabel(labels, key, fallback)
    return buildCardMenu(nodes, { query, config: menuConfig, resolveLabel })
  }, [editor, query, menuConfig, labels])

  const insert = React.useCallback<CardMenuInsert>(
    (insertCommand, { insertParams = {}, queryParams = [] } = {}) => {
      const dataset = { ...insertParams }

      for (let i = 0; i < queryParams.length; i++) {
        // `!== undefined`, not truthiness: a typed-but-empty param ('') is a
        // legal value and must reach the dataset
        if (commandParams[i] !== undefined) {
          const key = queryParams[i]
          const value = commandParams[i]
          dataset[key] = value
        }
      }

      // deliberate boundary: the card menu is a heterogeneous registry of
      // command/payload pairs built from each card's declaration-derived menu
      // data, so the specific payload type is erased here. Each plugin handler
      // re-narrows the payload with its own dataset type guard.
      const dispatch = () => editor.dispatchCommand(insertCommand, dataset)

      if (!replaceTriggerParagraph) {
        dispatch()
        return
      }

      // the trigger-paragraph swap is headless in card-menu-trigger; the
      // hook keeps only the type-erased dispatch
      editor.update(() => {
        $swapTriggerParagraph(dispatch)
      })
    },
    [editor, commandParams, replaceTriggerParagraph],
  )

  return { cardMenu, insert }
}
