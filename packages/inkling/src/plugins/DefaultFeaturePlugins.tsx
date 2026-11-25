import type { ComponentType } from 'react'

import AtLinkPlugin from '@kobato/inkling-internal/plugins/AtLinkPlugin'
import { CardInsertPlugin } from '@kobato/inkling-internal/plugins/CardInsertPlugin'
import { CardMenuPlugin } from '@kobato/inkling-internal/plugins/CardMenuPlugin'
import EmEnDashPlugin from '@kobato/inkling-internal/plugins/EmEnDashPlugin'
import { EmojiPickerPlugin } from '@kobato/inkling-internal/plugins/EmojiPickerPlugin'
import FootnotePlugin from '@kobato/inkling-internal/plugins/FootnotePlugin'
import HorizontalRulePlugin from '@kobato/inkling-internal/plugins/HorizontalRulePlugin'
import InklingSelectorPlugin from '@kobato/inkling-internal/plugins/InklingSelectorPlugin'
import { InklingSnippetPlugin } from '@kobato/inkling-internal/plugins/InklingSnippetPlugin'
import { InklingTablePlugin } from '@kobato/inkling-internal/plugins/InklingTablePlugin'
import MathInlinePlugin from '@kobato/inkling-internal/plugins/MathInlinePlugin'
import TypographyPlugin from '@kobato/inkling-internal/plugins/TypographyPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
export interface FeaturePluginEntry {
  key: string
  Component: ComponentType
}

export const DEFAULT_FEATURE_PLUGINS: readonly FeaturePluginEntry[] = [
  { key: 'list', Component: ListPlugin },
  { key: 'card-menu', Component: CardMenuPlugin },
  { key: 'snippet', Component: InklingSnippetPlugin },
  { key: 'selector', Component: InklingSelectorPlugin },
  { key: 'emoji-picker', Component: EmojiPickerPlugin },
  { key: 'at-link', Component: AtLinkPlugin },
  { key: 'em-en-dash', Component: EmEnDashPlugin },
  { key: 'typography', Component: TypographyPlugin },

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
