// Normalized DOM-tree comparison for markup parity pins — a rendered React
// tree against its hand-written HTML twin (e.g. the music-player card's
// paused render vs `musicPlayerFallbackHtml`). Both sides are parsed with
// the ambient DOM (happy-dom / jsdom per test environment) and reduced to a
// structural tree — tag names, class tokens, data-* attributes, optional
// normalized text — so attribute ordering, whitespace-only text, and
// serializer spelling (void tags, boolean attributes) cannot drift the
// comparison. Module-level code touches no DOM global, so importing it from
// any project is safe; only the calls need a DOM environment.

export interface StructureNode {
  /** Lowercased tag name. */
  tag: string
  /** Sorted class tokens (intersected with `classTokens` when given). */
  classes: string[]
  /** data-* attributes, keyed without the `data-` prefix. */
  data: Record<string, string>
  /** Whitespace-collapsed direct text — present only under `compareText`. */
  text?: string
  children: StructureNode[]
}

export interface StructureCompareOptions {
  /** CSS selectors for subtrees to drop before comparing — e.g. interactive
   * chrome (buttons, icons) that only the live component renders while its
   * static fallback twin deliberately stays inert. Matching is tested on
   * every element of BOTH sides; a matched subtree is removed wholesale. */
  prune?: readonly string[]
  /** Restrict the compared class tokens to this set. One side often adds
   * behavior-only classes (hover variants, state hooks) on top of the
   * shared skeleton tokens — those fall out of the comparison. */
  classTokens?: readonly string[]
  /** Restrict the compared data-* attributes to these names (given WITHOUT
   * the `data-` prefix); defaults to every data-* attribute. Pass `[]` when
   * the compared pair carries no shared data contract. */
  dataAttributes?: readonly string[]
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
  const children: StructureNode[] = []
  for (const child of element.children) {
    const node = toStructureNode(child, options)
    if (node !== null) {
      children.push(node)
    }
  }
  const node: StructureNode = { tag: element.tagName.toLowerCase(), classes, data, children }
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

/** Parses an HTML fragment into the normalized structural tree of its
 * top-level elements. */
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

function diffData(actual: Record<string, string>, expected: Record<string, string>, path: string): string[] {
  const diffs: string[] = []
  for (const key of Object.keys(expected)) {
    if (!(key in actual)) {
      diffs.push(`${path}: missing data-${key}="${expected[key]}"`)
    } else if (actual[key] !== expected[key]) {
      diffs.push(`${path}: data-${key}="${actual[key]}" vs "${expected[key]}"`)
    }
  }
  for (const key of Object.keys(actual)) {
    if (!(key in expected)) {
      diffs.push(`${path}: unexpected data-${key}="${actual[key]}"`)
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
  diffs.push(...diffData(actual.data, expected.data, path))
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

/** Diffs two structural trees; returns human-readable differences (empty
 * when the trees match). Child order is significant. */
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
