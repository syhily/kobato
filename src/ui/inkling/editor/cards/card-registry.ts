import type { LexicalEditor } from 'lexical'

import type { InklingFeatureMode } from '@/shared/inkling/schema'

import {
  $createCodeCardNode,
  $createHorizontalRuleCardNode,
  $createImageCardNode,
  $createMathCardNode,
  $createMusicCardNode,
  $createSolutionCardNode,
  $createTableCardNode,
  $createTwoColumnCardNode,
} from '@/ui/inkling/editor/cards/card-nodes'

const INKLING_CARD_NODE_TYPES = new Set<string>([
  'image-card',
  'code-block',
  'math-block',
  'music-card',
  'horizontal-rule',
  'table',
  'solution',
  'two-column',
])

/**
 * Inspect the editor's private node registry to discover which Inkling card
 * nodes are currently registered. This is the only module that may read
 * `editor._nodes`; if a future Lexical version removes it, switch to the
 * explicit `INKLING_CARD_NODE_TYPES` set.
 */
export function getInklingCardNodes(editor: LexicalEditor): string[] {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const registered = (editor as unknown as { _nodes?: Map<string, unknown> })._nodes
  if (registered === undefined) {
    return []
  }
  return Array.from(registered.keys()).filter((type) => INKLING_CARD_NODE_TYPES.has(type))
}

export interface InklingCardMenuItem {
  type: string
  label: string
  section: 'media' | 'rich' | 'layout' | 'structure'
  modes: InklingFeatureMode[]
  insert: (editor: LexicalEditor) => void
}

export const INKLING_CARD_MENU_ITEMS: InklingCardMenuItem[] = [
  {
    type: 'image-card',
    label: '图片',
    section: 'media',
    modes: ['article'],
    insert: (editor) => {
      editor.update(() => {
        $createImageCardNode({ src: '', alt: '', caption: '', layout: 'center' }).selectPrevious()
      })
    },
  },
  {
    type: 'code-block',
    label: '代码块',
    section: 'rich',
    modes: ['article', 'comment'],
    insert: (editor) => {
      editor.update(() => {
        $createCodeCardNode({ code: '' }).selectPrevious()
      })
    },
  },
  {
    type: 'math-block',
    label: '公式块',
    section: 'rich',
    modes: ['article', 'comment'],
    insert: (editor) => {
      editor.update(() => {
        $createMathCardNode({ tex: '' }).selectPrevious()
      })
    },
  },
  {
    type: 'music-card',
    label: '音乐',
    section: 'media',
    modes: ['article'],
    insert: (editor) => {
      editor.update(() => {
        $createMusicCardNode({ playerId: '' }).selectPrevious()
      })
    },
  },
  {
    type: 'horizontal-rule',
    label: '分隔线',
    section: 'structure',
    modes: ['article'],
    insert: (editor) => {
      editor.update(() => {
        $createHorizontalRuleCardNode().selectPrevious()
      })
    },
  },
  {
    type: 'table',
    label: '表格',
    section: 'layout',
    modes: ['article'],
    insert: (editor) => {
      editor.update(() => {
        $createTableCardNode({
          rows: [
            {
              type: 'tablerow',
              version: 1,
              cells: [
                { type: 'tablecell', version: 1, children: [] },
                { type: 'tablecell', version: 1, children: [] },
              ],
            },
            {
              type: 'tablerow',
              version: 1,
              cells: [
                { type: 'tablecell', version: 1, children: [] },
                { type: 'tablecell', version: 1, children: [] },
              ],
            },
          ],
        }).selectPrevious()
      })
    },
  },
  {
    type: 'solution',
    label: '解答块',
    section: 'structure',
    modes: ['article'],
    insert: (editor) => {
      editor.update(() => {
        const node = $createSolutionCardNode({
          children: [{ type: 'paragraph', version: 1, direction: null, format: '', indent: 0, children: [] }],
        })
        node.selectPrevious()
      })
    },
  },
  {
    type: 'two-column',
    label: '双栏',
    section: 'layout',
    modes: ['article'],
    insert: (editor) => {
      editor.update(() => {
        const node = $createTwoColumnCardNode({
          left: [{ type: 'paragraph', version: 1, direction: null, format: '', indent: 0, children: [] }],
          right: [{ type: 'paragraph', version: 1, direction: null, format: '', indent: 0, children: [] }],
        })
        node.selectPrevious()
      })
    },
  },
]

export interface InklingCardMenuSection {
  section: InklingCardMenuItem['section']
  label: string
  items: InklingCardMenuItem[]
}

export function buildInklingCardMenu(mode: InklingFeatureMode): InklingCardMenuSection[] {
  const filtered = INKLING_CARD_MENU_ITEMS.filter((item) => item.modes.includes(mode))
  const grouped = new Map<InklingCardMenuItem['section'], InklingCardMenuItem[]>()
  for (const item of filtered) {
    const existing = grouped.get(item.section) ?? []
    existing.push(item)
    grouped.set(item.section, existing)
  }

  const sectionLabels: Record<InklingCardMenuItem['section'], string> = {
    media: '媒体',
    rich: '富文本',
    layout: '布局',
    structure: '结构',
  }

  const sections: InklingCardMenuSection[] = []
  for (const [section, items] of grouped) {
    sections.push({ section, label: sectionLabels[section], items })
  }
  return sections
}
