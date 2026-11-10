// Normalized DOM-tree comparison for markup parity pins (a rendered React tree vs
// its hand-written HTML twin). Both sides reduce to tag names, class tokens, data-*
// attributes and optional normalized text, so attribute ordering, whitespace and
// serializer spelling cannot drift the comparison. Module level touches no DOM
// global; only the calls need a DOM environment.

export interface StructureNode {
  /** Lowercased tag name. */
  tag: string
  /** Sorted class tokens (intersected with `classTokens` when given). */
  classes: string[]
  /** data-* attributes, keyed without the `data-` prefix. */
  data: Record<string, string>
  /** Non-data attributes named by `attributes` (e.g. `src`, `alt`). */
  attributes: Record<string, string>
  /** Whitespace-collapsed direct text — present only under `compareText`. */
  text?: string
  children: StructureNode[]
}

export interface StructureCompareOptions {
  /** CSS selectors for subtrees to drop before comparing — interactive chrome only
   * the live component renders. Matched on both sides; removed wholesale. */
  prune?: readonly string[]
  /** Restrict compared class tokens to this set: behavior-only classes (hover
   * variants, state hooks) then fall out of the comparison. */
  classTokens?: readonly string[]
  /** Restrict compared data-* attributes to these names (no `data-` prefix);
   * defaults to every one. Pass `[]` when there is no shared data contract. */
  dataAttributes?: readonly string[]
  /** Also compare these non-data attributes (e.g. `['src', 'alt']`); an attribute
   * absent on one side diffs like a data-* mismatch. */
  attributes?: readonly string[]
  /** Also compare whitespace-normalized direct text content. */
  compareText?: boolean
}

function toStructureNode(element: Element, options: StructureCompareOptions): StructureNode | null {
  if (options.prune?.some((selector) => element.matches(selector))) {
    return null
  }
  const classes = [...element.classList]
    .filter((token) => options.classTokens === undefined || options.classTokens.includes(token))
    .sort()
  const data: Record<string, string> = {}
  for (const attribute of element.attributes) {
    if (!attribute.name.startsWith('data-')) {
      continue
    }
    const key = attribute.name.slice('data-'.length)
    if (options.dataAttributes !== undefined && !options.dataAttributes.includes(key)) {
      continue
    }
    data[key] = attribute.value
  }
  const attributes: Record<string, string> = {}
  for (const name of options.attributes ?? []) {
    const value = element.getAttribute(name)
    if (value !== null) {
      attributes[name] = value
    }
  }
  const children: StructureNode[] = []
  for (const child of element.children) {
    const node = toStructureNode(child, options)
    if (node !== null) {
      children.push(node)
    }
  }
  const node: StructureNode = { tag: element.tagName.toLowerCase(), classes, data, attributes, children }
  if (options.compareText) {
    let text = ''
    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent ?? ''
      }
    }
    text = text.replace(/\s+/g, ' ').trim()
    if (text !== '') {
      node.text = text
    }
  }
  return node
}

/** Parses an HTML fragment into the structural tree of its top-level elements. */
export function structureFromHtml(html: string, options: StructureCompareOptions = {}): StructureNode[] {
  const container = document.createElement('div')
  container.innerHTML = html
  const roots: StructureNode[] = []
  for (const child of container.children) {
    const node = toStructureNode(child, options)
    if (node !== null) {
      roots.push(node)
    }
  }
  return roots
}

function diffRecord(
  actual: Record<string, string>,
  expected: Record<string, string>,
  path: string,
  label: (key: string) => string,
): string[] {
  const diffs: string[] = []
  for (const key of Object.keys(expected)) {
    if (!(key in actual)) {
      diffs.push(`${path}: missing ${label(key)}="${expected[key]}"`)
    } else if (actual[key] !== expected[key]) {
      diffs.push(`${path}: ${label(key)}="${actual[key]}" vs "${expected[key]}"`)
    }
  }
  for (const key of Object.keys(actual)) {
    if (!(key in expected)) {
      diffs.push(`${path}: unexpected ${label(key)}="${actual[key]}"`)
    }
  }
  return diffs
}

function diffNode(actual: StructureNode, expected: StructureNode, path: string): string[] {
  const diffs: string[] = []
  if (actual.tag !== expected.tag) {
    diffs.push(`${path}: tag <${actual.tag}> vs <${expected.tag}>`)
  }
  if (actual.classes.join(' ') !== expected.classes.join(' ')) {
    diffs.push(`${path}: classes "${actual.classes.join(' ')}" vs "${expected.classes.join(' ')}"`)
  }
  diffs.push(...diffRecord(actual.data, expected.data, path, (key) => `data-${key}`))
  diffs.push(...diffRecord(actual.attributes, expected.attributes, path, (key) => key))
  if (actual.text !== expected.text) {
    diffs.push(`${path}: text ${JSON.stringify(actual.text)} vs ${JSON.stringify(expected.text)}`)
  }
  diffs.push(...diffLevel(actual.children, expected.children, path))
  return diffs
}

function diffLevel(actual: readonly StructureNode[], expected: readonly StructureNode[], path: string): string[] {
  const diffs: string[] = []
  if (actual.length !== expected.length) {
    diffs.push(`${path || '(fragment)'}: ${actual.length} element(s) vs ${expected.length}`)
  }
  const count = Math.min(actual.length, expected.length)
  for (let index = 0; index < count; index++) {
    diffs.push(...diffNode(actual[index], expected[index], `${path} > ${expected[index].tag}[${index}]`))
  }
  return diffs
}

/** Diffs two structural trees; returns human-readable differences (empty when
 * they match). Child order is significant. */
export function diffStructures(actual: readonly StructureNode[], expected: readonly StructureNode[]): string[] {
  return diffLevel(actual, expected, '')
}

/** Parses both HTML fragments and diffs their normalized structural trees. */
export function diffHtmlStructures(
  actualHtml: string,
  expectedHtml: string,
  options: StructureCompareOptions = {},
): string[] {
  return diffStructures(structureFromHtml(actualHtml, options), structureFromHtml(expectedHtml, options))
}
