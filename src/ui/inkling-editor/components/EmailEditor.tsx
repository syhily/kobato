import '@/ui/inkling-editor/styles/index.css'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import React from 'react'

import type { FileUploader } from '@/ui/inkling-editor/context/InklingComposerContext'

import InklingComposableEditor from '@/ui/inkling-editor/components/InklingComposableEditor'
import InklingComposer from '@/ui/inkling-editor/components/InklingComposer'
import { SharedHistoryContext } from '@/ui/inkling-editor/context/SharedHistoryContext'
import { SharedOnChangeContext } from '@/ui/inkling-editor/context/SharedOnChangeContext'
import EMAIL_EDITOR_NODES from '@/ui/inkling-editor/nodes/EmailEditorNodes'
import BookmarkPlugin from '@/ui/inkling-editor/plugins/BookmarkPlugin'
import ButtonPlugin from '@/ui/inkling-editor/plugins/ButtonPlugin'
import CalloutPlugin from '@/ui/inkling-editor/plugins/CalloutPlugin'
import CardMenuPlugin from '@/ui/inkling-editor/plugins/CardMenuPlugin'
import EmEnDashPlugin from '@/ui/inkling-editor/plugins/EmEnDashPlugin'
import EmojiPickerPlugin from '@/ui/inkling-editor/plugins/EmojiPickerPlugin'
import HorizontalRulePlugin from '@/ui/inkling-editor/plugins/HorizontalRulePlugin'
import HtmlPlugin from '@/ui/inkling-editor/plugins/HtmlPlugin'
import ImagePlugin from '@/ui/inkling-editor/plugins/ImagePlugin'
import InklingSelectorPlugin from '@/ui/inkling-editor/plugins/InklingSelectorPlugin'
import InklingSnippetPlugin from '@/ui/inkling-editor/plugins/InklingSnippetPlugin'
import { EMAIL_TRANSFORMERS } from '@/ui/inkling-editor/plugins/MarkdownShortcutPlugin'
import ReplacementStringsPlugin from '@/ui/inkling-editor/plugins/ReplacementStringsPlugin'
import { VISIBILITY_SETTINGS } from '@/ui/inkling-editor/utils/visibility'

export const EMAIL_EDITOR_CARD_CONFIG = {
  editorType: 'email',
  image: {
    allowedWidths: ['regular'],
  },
  visibilitySettings: VISIBILITY_SETTINGS.EMAIL_ONLY,
}

const ALLOWED_EMAIL_EDITOR_VISIBILITY = new Set([VISIBILITY_SETTINGS.EMAIL_ONLY, VISIBILITY_SETTINGS.NONE])

export function getEmailEditorCardConfig(cardConfig: Record<string, unknown> = {}) {
  const visibilitySettings = ALLOWED_EMAIL_EDITOR_VISIBILITY.has(cardConfig.visibilitySettings as string)
    ? (cardConfig.visibilitySettings as string)
    : EMAIL_EDITOR_CARD_CONFIG.visibilitySettings

  return {
    ...cardConfig,
    editorType: EMAIL_EDITOR_CARD_CONFIG.editorType,
    image: {
      ...(cardConfig.image as Record<string, unknown>),
      ...EMAIL_EDITOR_CARD_CONFIG.image,
    },
    visibilitySettings,
  }
}

interface EmailEditorProps {
  cardConfig?: Record<string, unknown>
  darkMode?: boolean
  fileUploader?: FileUploader
  initialEditorState?: unknown
  onChange?: (editorState: unknown) => void
  onError?: (error: Error) => void
  children?: React.ReactNode
  markdownTransformers?: unknown[]
  placeholderText?: string
  [key: string]: unknown
}

const EmailEditor = ({
  cardConfig = {},
  darkMode = false,
  fileUploader,
  initialEditorState,
  onChange,
  onError,
  children,
  markdownTransformers = EMAIL_TRANSFORMERS,
  placeholderText = 'Begin writing your email...',
  ...props
}: EmailEditorProps) => {
  const mergedCardConfig = getEmailEditorCardConfig(cardConfig)

  return (
    <InklingComposer
      cardConfig={mergedCardConfig}
      darkMode={darkMode}
      fileUploader={fileUploader}
      // oxlint-disable-next-line typescript/no-explicit-any
      initialEditorState={initialEditorState as any}
      nodes={EMAIL_EDITOR_NODES}
      onError={onError}
    >
      <SharedHistoryContext>
        <SharedOnChangeContext onChange={onChange}>
          <InklingComposableEditor
            {...props}
            markdownTransformers={markdownTransformers}
            placeholderText={placeholderText}
          >
            <BookmarkPlugin />
            <ButtonPlugin />
            <CalloutPlugin />
            <CardMenuPlugin />
            <EmEnDashPlugin />
            <EmojiPickerPlugin />
            <HorizontalRulePlugin />
            <HtmlPlugin />
            <ImagePlugin />
            <InklingSelectorPlugin />
            <InklingSnippetPlugin />
            <ListPlugin />
            <ReplacementStringsPlugin />
            {children}
          </InklingComposableEditor>
        </SharedOnChangeContext>
      </SharedHistoryContext>
    </InklingComposer>
  )
}

export default EmailEditor
