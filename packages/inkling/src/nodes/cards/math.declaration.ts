import { BaseMathNode } from '@/nodes/base/nodes/math/MathNode'

import type { CardDeclaration } from './card-declaration'

export const mathDeclaration = {
  nodeType: 'math',
  baseNode: BaseMathNode,
  decorateTarget: {
    width: 'regular',
  },
  menu: [
    {
      label: 'Math',
      labelKey: 'math',
      desc: 'Block math (KaTeX)',
      icon: 'math',
      command: 'insert',
      matches: ['math', 'katex', 'tex', 'formula'],
      priority: 17,
      shortcut: '/math',
    },
  ],
  insert: { openInEditMode: true },
  toolbarLabel: 'math',
  // Not in the markdown round-trip: GFM has no math block syntax.
} satisfies CardDeclaration<'math'>
