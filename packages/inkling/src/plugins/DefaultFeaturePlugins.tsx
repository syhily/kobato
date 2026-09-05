import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import React from 'react'

import AtLinkPlugin from '@/plugins/AtLinkPlugin'
import { CardInsertPlugin } from '@/plugins/CardInsertPlugin'
import { CardMenuPlugin } from '@/plugins/CardMenuPlugin'
import EmEnDashPlugin from '@/plugins/EmEnDashPlugin'
import { EmojiPickerPlugin } from '@/plugins/EmojiPickerPlugin'
import FootnotePlugin from '@/plugins/FootnotePlugin'
import HorizontalRulePlugin from '@/plugins/HorizontalRulePlugin'
import InklingSelectorPlugin from '@/plugins/InklingSelectorPlugin'
import { InklingSnippetPlugin } from '@/plugins/InklingSnippetPlugin'
import { InklingTablePlugin } from '@/plugins/InklingTablePlugin'
import MathInlinePlugin from '@/plugins/MathInlinePlugin'

// A feature plugin entry, as data. The explicit key keeps rendering stable
// without leaning on component names (which minification can collapse).
export interface FeaturePluginEntry {
  key: string
  Component: React.ComponentType
}

// The feature plugin entries InklingEditor adds on top of the core plugin
// set every InklingComposableEditor mounts (CORE_PLUGINS, ./CorePlugins:
// rich-text, history, behaviour, toolbar, markdown, drag-drop, events), as
// data and in render order. The default editor surface is the concatenation
// of the two lists — this is deliberately not "all defaults".
export const DEFAULT_FEATURE_PLUGINS: readonly FeaturePluginEntry[] = [
  // Lexical
  { key: 'list', Component: ListPlugin }, // adds indent/outdent/remove etc support
  // Inkling
  { key: 'card-menu', Component: CardMenuPlugin },
  { key: 'snippet', Component: InklingSnippetPlugin },
  { key: 'selector', Component: InklingSelectorPlugin }, // Gif selector
  { key: 'emoji-picker', Component: EmojiPickerPlugin },
  { key: 'at-link', Component: AtLinkPlugin },
  { key: 'em-en-dash', Component: EmEnDashPlugin },
  // Cards
  { key: 'card-insert', Component: CardInsertPlugin },
  { key: 'horizontal-rule', Component: HorizontalRulePlugin },
  { key: 'math-inline', Component: MathInlinePlugin },
  { key: 'table', Component: InklingTablePlugin },
  { key: 'footnote', Component: FootnotePlugin },
]

export const DefaultFeaturePlugins = () => {
  return (
    <>
      {DEFAULT_FEATURE_PLUGINS.map(({ key, Component }) => (
        <Component key={key} />
      ))}
    </>
  )
}

export default DefaultFeaturePlugins
