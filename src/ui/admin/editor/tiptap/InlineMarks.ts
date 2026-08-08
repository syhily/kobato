import type { EditorState } from '@tiptap/pm/state'

import { InputRule, Mark, markInputRule, markPasteRule } from '@tiptap/core'

import { generateBlockKey } from '@/shared/pt/utils'

function isInTableCell(state: EditorState): boolean {
  const $from = state.selection.$from
  for (let depth = $from.depth; depth > 0; depth--) {
    const name = $from.node(depth).type.name
    if (name === 'tableCell' || name === 'tableHeader') {
      return true
    }
  }
  return false
}

function tableSafeMarkInputRule(config: Parameters<typeof markInputRule>[0]): InputRule {
  const inner = markInputRule(config)
  return new InputRule({
    find: config.find,
    handler: (props) => {
      if (isInTableCell(props.state)) {
        return null
      }
      return inner.handler(props)
    },
    undoable: inner.undoable,
  })
}

const mathInlineInputRegex = /(^|[^\\$])\$(?!\$)([^$\n]+)\$(?!\$)$/
const mathInlinePasteRegex = /(^|[^\\$])\$(?!\$)([^$\n]+)\$(?!\$)/g

export const MathInlineMark = Mark.create({
  name: 'mathInline',
  inclusive: false,
  addAttributes() {
    return {
      _key: { default: '' },
      tex: { default: '' },
      mathml: { default: undefined },
      svg: { default: undefined },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-math-inline]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', { 'data-math-inline': '', class: 'math math-inline', ...HTMLAttributes }, 0]
  },
  addInputRules() {
    return [
      tableSafeMarkInputRule({
        find: mathInlineInputRegex,
        type: this.type,
        getAttributes: (match) => {
          const tex = match[match.length - 1] ?? ''
          return { tex, _key: generateBlockKey() }
        },
      }),
    ]
  },
  addPasteRules() {
    return [
      markPasteRule({
        find: mathInlinePasteRegex,
        type: this.type,
        getAttributes: (match) => {
          const tex = match[match.length - 1] ?? ''
          return { tex, _key: generateBlockKey() }
        },
      }),
    ]
  },
})

// Footnote refs are inline marks (insert trigger: `footnote-caret-trigger`); PT keeps defs beside prose — see the merge layer.
export const FootnoteRefMark = Mark.create({
  name: 'footnoteRef',
  inclusive: true,
  addAttributes() {
    return {
      _key: { default: '' },
      targetKey: { default: '' },
      index: { default: 1 },
    }
  },
  parseHTML() {
    return [{ tag: 'sup[data-footnote-ref]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['sup', { 'data-footnote-ref': '', class: 'footnote-ref', ...HTMLAttributes }, 0]
  },
})
