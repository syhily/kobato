import type { LexicalEditorState } from '@kobato/inkling-internal/headless/schema'

import { unsafeCast } from '@kobato/utils/unsafe-cast'

type JsonObject = Record<string, unknown>

const ELEMENT_DEFAULTS: JsonObject = { direction: null, format: '', indent: 0 }
const TEXT_DEFAULTS: JsonObject = { detail: 0, format: 0, mode: 'normal', style: '' }
const LINK_DEFAULTS: JsonObject = { target: null, rel: null, title: null }

const NODE_DEFAULTS: Record<string, JsonObject> = {
  root: { ...ELEMENT_DEFAULTS, version: 1 },
  paragraph: { ...ELEMENT_DEFAULTS, textFormat: 0, textStyle: '', version: 1 },
  linebreak: { version: 1 },
  horizontalrule: { version: 1 },
  'extended-heading': { ...ELEMENT_DEFAULTS, version: 1 },
  'extended-quote': { ...ELEMENT_DEFAULTS, version: 1 },
  'extended-text': { ...TEXT_DEFAULTS, version: 1 },
  'footnote-ref': { ...TEXT_DEFAULTS, version: 1 },
  list: { listType: 'number', start: 1, ...ELEMENT_DEFAULTS, version: 1 },
  listitem: { value: 1, ...ELEMENT_DEFAULTS, version: 1 },
  link: { ...LINK_DEFAULTS, ...ELEMENT_DEFAULTS, version: 1 },
  autolink: { isUnlinked: false, ...LINK_DEFAULTS, ...ELEMENT_DEFAULTS, version: 1 },
  table: { ...ELEMENT_DEFAULTS, version: 1 },
  tablerow: { ...ELEMENT_DEFAULTS, version: 1 },
  tablecell: { headerState: 0, colSpan: 1, rowSpan: 1, backgroundColor: null, ...ELEMENT_DEFAULTS, version: 1 },
  image: { version: 1 },
  codeblock: { version: 1 },
  math: { version: 1 },
  'math-inline': { version: 1 },
  footnotedefinition: { version: 1 },
  solution: { version: 1 },
  'two-column': { version: 1 },
  'music-player': { version: 1 },
}

const TABLE_STRIP_ONLY: JsonObject = { frozenColumnCount: 0, frozenRowCount: 0, rowStriping: false }

const listTagFor = (listType: unknown): 'ol' | 'ul' => (listType === 'number' ? 'ol' : 'ul')

function walkNodes(root: JsonObject, visit: (node: JsonObject) => void): void {
  const stack: JsonObject[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()
    if (node === undefined) {
      continue
    }
    visit(node)
    const children: unknown = node.children
    if (Array.isArray(children)) {
      for (const child of children as unknown[]) {
        if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
          stack.push(unsafeCast<JsonObject>(child))
        }
      }
    }
  }
}

const defaultsFor = (node: JsonObject): JsonObject | undefined => {
  const type: unknown = node.type
  return typeof type === 'string' ? NODE_DEFAULTS[type] : undefined
}

function fillNode(node: JsonObject): void {
  const defaults = defaultsFor(node)
  if (defaults === undefined) {
    return
  }
  for (const [key, value] of Object.entries(defaults)) {
    node[key] ??= value
  }
  if (node.type === 'list') {
    node.tag ??= listTagFor(node.listType)
  }
}

function stripNode(node: JsonObject): void {
  const defaults = defaultsFor(node)
  if (defaults === undefined) {
    return
  }
  for (const [key, value] of Object.entries(defaults)) {
    if (node[key] === value) {
      delete node[key]
    }
  }
  if (node.type === 'list' && node.tag === listTagFor(node.listType ?? 'number')) {
    delete node.tag
  }
  if (node.type === 'table') {
    for (const [key, value] of Object.entries(TABLE_STRIP_ONLY)) {
      if (node[key] === value) {
        delete node[key]
      }
    }
  }
}

const hasObjectRoot = (value: unknown): value is { root: JsonObject } =>
  value !== null &&
  typeof value === 'object' &&
  'root' in value &&
  (value as JsonObject).root !== null &&
  typeof (value as JsonObject).root === 'object' &&
  !Array.isArray((value as JsonObject).root)

export function normalizeLexicalDialect(value: unknown): unknown {
  if (!hasObjectRoot(value)) {
    return value
  }
  const clone = structuredClone(value)
  walkNodes(clone.root, fillNode)
  return clone
}

export function compactLexicalEditorState<T extends LexicalEditorState>(state: T): T {
  const clone = unsafeCast<JsonObject>(structuredClone(state))
  walkNodes(unsafeCast<JsonObject>(clone.root), stripNode)
  return unsafeCast<T>(clone)
}
