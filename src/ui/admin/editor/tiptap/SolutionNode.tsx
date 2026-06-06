import { mergeAttributes, Node } from '@tiptap/core'

export const SolutionNode = Node.create({
  name: 'solution',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      _key: { default: '' },
    }
  },
  parseHTML() {
    return [{ tag: 'blockquote[data-pt-solution]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['blockquote', mergeAttributes(HTMLAttributes, { 'data-pt-solution': '' }), 0]
  },
})
