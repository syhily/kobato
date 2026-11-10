import type { ElementNode, Klass, LexicalEditor, LexicalNode } from 'lexical'

/* c8 ignore start */
import { $isListItemNode, $isListNode, ListItemNode } from '@lexical/list'
import { $createParagraphNode, $getRoot, $isLineBreakNode, $isRootNode, $isTextNode } from 'lexical'

import { registerNodeTransformIfPresent } from '@/inkling/transforms/register-node-transform'
/* c8 ignore stop */

export type CreateNodeFn<T extends LexicalNode> = (originalNode: T) => T

// Pasting or importing HTML can leave nested element nodes: headings, image
// decorators, lists or large content runs inside paragraphs. Only "card"
// decorators are supported at the top level, so nested element nodes confuse
// selection and deletion, and the renderer does not expect them.
//
// The transform detects invalid nesting and pulls non-inline children out,
// inserting them after the node's top-level parent. Nodes are moved, never
// removed, so no pasted or imported content is lost.

// lists can only be top-level or nested inside list items
function $isInvalidListNode(node: LexicalNode) {
  if (!$isListNode(node)) {
    return false
  }

  const parent = node.getParent()
  return !($isRootNode(parent) || $isListItemNode(parent))
}

// list items can only exist within a list node
function $isInvalidListItemNode(node: LexicalNode) {
  if (!$isListItemNode(node)) {
    return false
  }

  const parent = node.getParent()
  return !$isListNode(parent)
}

// A list item hoisted to the root has to be unwrapped here, at insertion time.
// Moving this to a follow-up transform is not possible: Lexical's built-in
// ListItemNode $transform is seeded with the node class, so it always runs
// ahead of any editor-registered transform and wraps a root-level orphan in a
// fresh list before a self-validity transform could observe it.
function $unwrapListItemForRootInsertion(child: ListItemNode, parent: ElementNode) {
  const paragraphNode = $createParagraphNode()
  paragraphNode.append(...child.getChildren())
  child.remove()
  parent.insertAfter(paragraphNode)
}

// non-inline nodes can only exist at top-level inside a root node
// ignore list and list item nodes because they aren't inline but can be nested inside each other
function $isInvalidChildNode(node: LexicalNode) {
  if ($isLineBreakNode(node) || $isTextNode(node)) {
    return false
  }
  return (
    $isInvalidListNode(node) ||
    $isInvalidListItemNode(node) ||
    (!node.isInline() && !$isListNode(node) && !$isListItemNode(node))
  )
}

export function denestTransform<T extends ElementNode>(node: T, createNode: CreateNodeFn<T>) {
  const children = node.getChildren()

  const hasInvalidChild = children.some($isInvalidChildNode)

  if (!hasInvalidChild) {
    return
  }

  // a temporary detached node holds the moved nodes; without it each child
  // move re-triggers the transform, looping forever
  const tempParagraph = $createParagraphNode()

  // a fresh node of the current type collects inline children so their order
  // survives the move; it is appended to the temp paragraph and replaced each
  // time a non-inline child is found
  let currentElementNode = createNode(node)

  children.forEach((child: LexicalNode) => {
    if ($isInvalidChildNode(child)) {
      if (currentElementNode.getChildrenSize() > 0) {
        tempParagraph.append(currentElementNode)
        currentElementNode = createNode(node)
      }
      tempParagraph.append(child)
    } else {
      currentElementNode.append(child)
    }
  })

  if (currentElementNode.getChildrenSize() > 0) {
    tempParagraph.append(currentElementNode)
  }

  // find the top-level parent to insert nodes after in case of deeper nesting,
  // e.g. images inside lists
  let parent: ElementNode = node
  while (parent.getParent() && parent.getParent() !== $getRoot()) {
    parent = parent.getParentOrThrow()
  }

  // iterate in reverse: insertAfter places each child directly after the
  // parent, so the first child must be inserted last to keep its order
  const movedChildren = tempParagraph.getChildren()
  for (let index = movedChildren.length - 1; index >= 0; index -= 1) {
    const child = movedChildren[index]
    // list items must not land directly in the root node
    if ($isRootNode(parent.getParent()) && $isListItemNode(child)) {
      $unwrapListItemForRootInsertion(child, parent)
      continue
    }

    parent.insertAfter(child)
  }

  node.remove()

  tempParagraph.remove()
}

export function registerDenestTransform<T extends ElementNode>(
  editor: LexicalEditor,
  klass: Klass<T>,
  createNode: CreateNodeFn<T>,
): () => void {
  return registerNodeTransformIfPresent(editor, klass, (node) => {
    denestTransform(node, createNode)
  })
}
