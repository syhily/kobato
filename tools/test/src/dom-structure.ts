export interface StructureNode {
  tag: string
  classes: string[]
  data: Record<string, string>
  attributes: Record<string, string>
  text?: string
  children: StructureNode[]
}

export interface StructureCompareOptions {
  prune?: readonly string[]
  classTokens?: readonly string[]
  dataAttributes?: readonly string[]
  attributes?: readonly string[]
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

export function diffStructures(actual: readonly StructureNode[], expected: readonly StructureNode[]): string[] {
  return diffLevel(actual, expected, '')
}

export function diffHtmlStructures(
  actualHtml: string,
  expectedHtml: string,
  options: StructureCompareOptions = {},
): string[] {
  return diffStructures(structureFromHtml(actualHtml, options), structureFromHtml(expectedHtml, options))
}
