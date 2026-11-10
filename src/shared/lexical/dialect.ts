import type { LexicalEditorState } from '@/shared/lexical/schema'

import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Two wire dialects of the same editor state:
//
// - FULL — what a live editor's `toJSON()` writes: every serializer-default
//   key present (`direction: null`, `format: ''`, `indent: 0`, `version: 1`,
//   the text-node quartet, paragraph `textFormat`/`textStyle`, link
//   `target`/`rel`/`title: null`, …);
// - COMPACT storage — the full dialect minus those default keys, the same
//   slimming Lexical's own `toJSON(true)` applies, extended to the inkling
//   custom nodes whose exportJSON overrides never forward the compact flag.
//
// The dialects round-trip because every importer heals a missing key back to
// the full-exporter default (pinned by
// tests/inkling/unit/compact-round-trip.test.ts); the schema's
// `normalizeLexicalDialect` preprocess plays that role at the validation
// boundary, so both dialects parse to one full-dialect shape.
//
// Judgment calls mirroring the importer (NOT a naive "missing = default"
// guess): `list.listType` heals to 'number' and `tag` is re-derived from
// listType at import, so compact drops `tag` outright;
// `table.frozenColumnCount`/`frozenRowCount`/`rowStriping` are strip-only —
// the full exporter omits them at default, so normalize must not add them.

type JsonObject = Record<string, unknown>

const ELEMENT_DEFAULTS: JsonObject = { direction: null, format: '', indent: 0 }
const TEXT_DEFAULTS: JsonObject = { detail: 0, format: 0, mode: 'normal', style: '' }
const LINK_DEFAULTS: JsonObject = { target: null, rel: null, title: null }

/** Per-type keys the serializers write even at their default value — stripped
 * by `compactLexicalEditorState`, refilled by `normalizeLexicalDialect`. Only
 * keys the FULL exporter writes unconditionally belong here (a key the exporter
 * writes only when non-default stays optional in both dialects). */
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
  // Cards carry meaningful datasets end to end; only the version stamp is a
  // serializer default.
  image: { version: 1 },
  codeblock: { version: 1 },
  math: { version: 1 },
  'math-inline': { version: 1 },
  footnotedefinition: { version: 1 },
  solution: { version: 1 },
  'two-column': { version: 1 },
  'music-player': { version: 1 },
}

/** Strip-only table keys (see the module note): the full exporter omits them
 * at default, so they are never refilled. */
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

/**
 * The schema-side heal: deep-clone the candidate and refill every
 * serializer-default key the compact dialect omits, so the parse output is
 * always the full dialect regardless of which dialect was stored/sent.
 * Shapes without an object root pass through untouched — reporting them is the
 * shape schema's job.
 */
export function normalizeLexicalDialect(value: unknown): unknown {
  if (!hasObjectRoot(value)) {
    return value
  }
  const clone = structuredClone(value)
  walkNodes(clone.root, fillNode)
  return clone
}

/**
 * The write-side slimming: deep-clone a full-dialect state and delete every
 * serializer-default key. The result is the compact storage dialect — it no
 * longer satisfies the full-dialect shape at runtime, and heals back through
 * `lexicalEditorStateSchema.parse` (normalize preprocess) or the editor's own
 * `parseEditorState`. The return type stays `T` because every consumer either
 * persists the result or re-parses it through the schema.
 */
export function compactLexicalEditorState<T extends LexicalEditorState>(state: T): T {
  const clone = unsafeCast<JsonObject>(structuredClone(state))
  walkNodes(unsafeCast<JsonObject>(clone.root), stripNode)
  return unsafeCast<T>(clone)
}
