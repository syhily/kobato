import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import React from 'react'

import AtLinkPlugin from './AtLinkPlugin'
import { CardInsertPlugin } from './CardInsertPlugin'
import { CardMenuPlugin } from './CardMenuPlugin'
import EmEnDashPlugin from './EmEnDashPlugin'
import { EmojiPickerPlugin } from './EmojiPickerPlugin'
import FootnotePlugin from './FootnotePlugin'
import HorizontalRulePlugin from './HorizontalRulePlugin'
import InklingSelectorPlugin from './InklingSelectorPlugin'
import { InklingSnippetPlugin } from './InklingSnippetPlugin'
import { InklingTablePlugin } from './InklingTablePlugin'
import MathInlinePlugin from './MathInlinePlugin'
import TypographyPlugin from './TypographyPlugin'

// A feature plugin entry, as data. The explicit key keeps rendering stable
// without leaning on component names (which minification can collapse).
export interface FeaturePluginEntry {
  key: string
  Component: React.ComponentType
}

// The feature plugin entries InklingEditor adds on top of CORE_PLUGINS
// (./CorePlugins) — as data, in render order; the default editor surface is
// the concatenation of the two lists.
export const DEFAULT_FEATURE_PLUGINS: readonly FeaturePluginEntry[] = [
  // Lexical
  { key: 'list', Component: ListPlugin }, // adds indent/outdent/remove etc support
  // Inkling
  { key: 'card-menu', Component: CardMenuPlugin },
  { key: 'snippet', Component: InklingSnippetPlugin },
  { key: 'selector', Component: InklingSelectorPlugin }, // gif + image-library overlays
  { key: 'emoji-picker', Component: EmojiPickerPlugin },
  { key: 'at-link', Component: AtLinkPlugin },
  { key: 'em-en-dash', Component: EmEnDashPlugin },
  { key: 'typography', Component: TypographyPlugin },
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
