import { ActionToolbar } from '@kobato/inkling-internal/components/ui/ActionToolbar'
import { SnippetCreateToolbar } from '@kobato/inkling-internal/components/ui/SnippetCreateToolbar'
import {
  ToolbarMenu,
  ToolbarMenuItem,
  ToolbarMenuSeparator,
  type ToolbarIconName,
} from '@kobato/inkling-internal/components/ui/ToolbarMenu'
import CardContext from '@kobato/inkling-internal/context/CardContext'
import { useCardIsEditing, useCardIsSelected } from '@kobato/inkling-internal/context/CardSelectionStoreContext'
import { useInklingSnippetSettings } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import { useInklingLabels } from '@kobato/inkling-internal/hooks/useInklingLabels'
import { getCardToolbarLabel } from '@kobato/inkling-internal/nodes/cards/card-facts'
import { EDIT_CARD_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/commands'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey, type NodeKey } from 'lexical'
import React from 'react'

export type CardToolbarItem =
  | { kind: 'edit'; dataTestId?: string }
  | { kind: 'snippet' }
  | { kind: 'separator'; hide?: boolean }
  | {
      kind: 'custom'
      icon: ToolbarIconName
      label: string
      onClick: (event: React.MouseEvent) => void
      isActive?: boolean
      hide?: boolean
      dataTestId?: string
    }

export interface CardActionToolbarProps {
  nodeKey: NodeKey
  visibleWhen?: boolean

  hideWhileEditing?: boolean
  items?: CardToolbarItem[]
  editDataTestId?: string
}
const DEFAULT_ITEMS: CardToolbarItem[] = [{ kind: 'edit' }, { kind: 'separator' }, { kind: 'snippet' }]

export function useCardToolbarLabel(nodeKey: NodeKey): string | undefined {
  const { cardType } = React.useContext(CardContext)
  const [editor] = useLexicalComposerContext()
  const [fallbackType] = React.useState(() =>
    cardType !== undefined && cardType !== null
      ? null
      : editor.getEditorState().read(() => $getNodeByKey(nodeKey)?.getType() ?? null),
  )
  return getCardToolbarLabel(cardType ?? fallbackType)
}

export function CardActionToolbar({
  nodeKey,
  visibleWhen = true,
  hideWhileEditing = true,
  items,
  editDataTestId,
}: CardActionToolbarProps) {
  const resolvedItems: CardToolbarItem[] =
    items ??
    (editDataTestId
      ? [{ kind: 'edit', dataTestId: editDataTestId }, { kind: 'separator' }, { kind: 'snippet' }]
      : DEFAULT_ITEMS)
  const [editor] = useLexicalComposerContext()
  const { createSnippet } = useInklingSnippetSettings()
  const labels = useInklingLabels()
  const isSelected = useCardIsSelected(nodeKey)
  const isEditing = useCardIsEditing(nodeKey)
  const [showSnippetToolbar, setShowSnippetToolbar] = React.useState<boolean>(false)
  const toolbarLabel = useCardToolbarLabel(nodeKey)

  const handleEdit = (event: React.MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    editor.dispatchCommand(EDIT_CARD_COMMAND, { cardKey: nodeKey })
  }

  const separatorKeys = new Map<CardToolbarItem, number>()
  let separatorCount = 0
  for (const item of resolvedItems) {
    if (item.kind === 'separator') {
      separatorCount += 1
      separatorKeys.set(item, separatorCount)
    }
  }
  const renderItem = (item: CardToolbarItem): React.ReactNode => {
    switch (item.kind) {
      case 'edit':
        return (
          <ToolbarMenuItem
            key="edit"
            dataTestId={item.dataTestId}
            icon="edit"
            isActive={false}
            label={labels['toolbar.edit']}
            onClick={handleEdit}
          />
        )
      case 'snippet':
        return (
          <ToolbarMenuItem
            key="snippet"
            dataTestId="create-snippet"
            hide={!createSnippet}
            icon="snippet"
            isActive={false}
            label={labels['toolbar.saveAsSnippet']}
            onClick={() => setShowSnippetToolbar(true)}
          />
        )
      case 'separator':
        return (
          <ToolbarMenuSeparator key={`separator-${separatorKeys.get(item) ?? 0}`} hide={item.hide ?? !createSnippet} />
        )
      case 'custom':
        return (
          <ToolbarMenuItem
            key={`custom-${item.label}`}
            dataTestId={item.dataTestId}
            hide={item.hide}
            icon={item.icon}
            isActive={item.isActive ?? false}
            label={item.label}
            onClick={item.onClick}
          />
        )
    }
  }

  return (
    <>
      <ActionToolbar data-inkling-card-toolbar={toolbarLabel} isVisible={showSnippetToolbar}>
        <SnippetCreateToolbar nodeKey={nodeKey} onClose={() => setShowSnippetToolbar(false)} />
      </ActionToolbar>

      <ActionToolbar
        data-inkling-card-toolbar={toolbarLabel}
        isVisible={isSelected && !(hideWhileEditing && isEditing) && !showSnippetToolbar && visibleWhen}
      >
        <ToolbarMenu>{resolvedItems.map(renderItem)}</ToolbarMenu>
      </ActionToolbar>
    </>
  )
}
