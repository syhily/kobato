import { isKnownLocaleValue } from '@kobato/i18n/locales'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { parseAst } from 'vite'

export type ScanRule =
  | 'jsx-text'
  | 'jsx-attribute'
  | 'title-meta'
  | 'toast'
  | 'domain-error'
  | 'to-locale'
  | 'hardcoded-locale'
  | 'han-literal'

export interface ScanViolation {
  rule: ScanRule
  file: string
  line: number
  column: number
  text: string
}

export interface ScanAllowlistEntry {
  path: string
  rules?: readonly ScanRule[]
  text?: string
}

export interface ScanOptions {
  roots: readonly string[]
  allowlist?: readonly ScanAllowlistEntry[]
}

export interface ScanResult {
  violations: ScanViolation[]
  allowlisted: ScanViolation[]
  scannedFiles: string[]
  skippedFiles: string[]
}

const COPY_TEXT =
  /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/

const HAN_TEXT = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/

const COPY_STORE_PREFIXES = [
  'packages/shared/i18n/src/messages/',
  'packages/shared/i18n/src/inkling-labels/',
  'packages/web/kit/src/ui/shared/editor/inkling-labels/',
]

const COPY_STORE_FILES = new Set(['packages/shared/i18n/src/fallback-messages.ts'])

export function isContentStoreFile(file: string): boolean {
  return COPY_STORE_FILES.has(file)
}

function isHanCopyStore(file: string): boolean {
  return COPY_STORE_PREFIXES.some((prefix) => file.startsWith(prefix))
}

const COPY_ATTRIBUTES = new Set(['aria-label', 'placeholder', 'title', 'alt'])

const MESSAGE_ID = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/

interface AstNode {
  type: string
  start: number
  end: number
  [key: string]: unknown
}

function isNode(value: unknown): value is AstNode {
  return value !== null && typeof value === 'object' && typeof (value as AstNode).type === 'string'
}

function lineStartOffsets(source: string): number[] {
  const starts = [0]
  let newline = source.indexOf('\n')
  while (newline !== -1) {
    starts.push(newline + 1)
    newline = source.indexOf('\n', newline + 1)
  }
  return starts
}

function positionAt(starts: readonly number[], offset: number): { line: number; column: number } {
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (starts[mid] <= offset) {
      low = mid
    } else {
      high = mid - 1
    }
  }
  return { line: low + 1, column: offset - starts[low] + 1 }
}

function identifierName(node: unknown): string | null {
  if (!isNode(node)) {
    return null
  }
  if ((node.type === 'Identifier' || node.type === 'JSXIdentifier') && typeof node.name === 'string') {
    return node.name
  }
  return null
}

const INTERPOLATION_MARKER = '\u2026'

interface TemplateQuasis {
  text: string
  interpolated: boolean
}

function templateQuasis(node: AstNode): TemplateQuasis | null {
  const quasis = node.quasis
  if (!Array.isArray(quasis)) {
    return null
  }
  const parts: string[] = []
  for (const quasi of quasis) {
    const value = (quasi as { value?: { cooked?: string; raw?: string } }).value
    parts.push(value?.cooked ?? value?.raw ?? '')
  }
  const expressions = node.expressions
  return {
    text: parts.join(INTERPOLATION_MARKER),
    interpolated: Array.isArray(expressions) && expressions.length > 0,
  }
}

function literalText(node: unknown): string | null {
  if (!isNode(node)) {
    return null
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value
  }
  if (node.type === 'TemplateLiteral') {
    return templateQuasis(node)?.text ?? null
  }
  if (node.type === 'JSXExpressionContainer') {
    return literalText(node.expression)
  }
  return null
}

function exactText(node: unknown): string | null {
  if (!isNode(node)) {
    return null
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value
  }
  if (node.type === 'TemplateLiteral') {
    const quasis = templateQuasis(node)
    return quasis !== null && !quasis.interpolated ? quasis.text : null
  }
  return null
}

function expressionCopyTexts(node: unknown, out: string[] = []): string[] {
  if (!isNode(node)) {
    return out
  }
  switch (node.type) {
    case 'Literal':
      if (typeof node.value === 'string' && COPY_TEXT.test(node.value)) {
        out.push(node.value)
      }
      return out
    case 'TemplateLiteral': {
      const text = literalText(node)
      if (text !== null && COPY_TEXT.test(text)) {
        out.push(text)
      }
      return out
    }
    case 'ConditionalExpression':
      expressionCopyTexts(node.consequent, out)
      expressionCopyTexts(node.alternate, out)
      return out
    case 'LogicalExpression':
      expressionCopyTexts(node.right, out)
      return out
    case 'BinaryExpression':
      if (node.operator === '+') {
        expressionCopyTexts(node.left, out)
        expressionCopyTexts(node.right, out)
      }
      return out
    case 'ParenthesizedExpression':
    case 'JSXExpressionContainer':
    case 'TSAsExpression':
    case 'TSNonNullExpression':
      return expressionCopyTexts(node.expression, out)
    default:
      return out
  }
}

function isAbsentLocaleArgument(argument: unknown): boolean {
  if (!isNode(argument)) {
    return true
  }
  if (argument.type === 'Identifier' && argument.name === 'undefined') {
    return true
  }
  if (argument.type === 'UnaryExpression' && argument.operator === 'void') {
    return true
  }
  if (argument.type === 'ArrayExpression') {
    const elements = argument.elements
    return !Array.isArray(elements) || elements.length === 0
  }
  return false
}

function callArguments(node: AstNode): unknown[] {
  const args = node.arguments
  return Array.isArray(args) ? args : []
}

function report(ctx: VisitContext, rule: ScanRule, node: AstNode, text: string): void {
  const { line, column } = positionAt(ctx.lineStarts, node.start)
  ctx.violations.push({ rule, file: ctx.file, line, column, text })
}

interface VisitContext {
  lineStarts: readonly number[]
  file: string
  violations: ScanViolation[]
  jsxCopyCovered?: boolean
  hanCoveredNodes: WeakSet<object>
  hanCopyStore: boolean
}

function visit(node: AstNode, ctx: VisitContext): void {
  const { hanCopyStore } = ctx

  switch (node.type) {
    case 'JSXText': {
      const value = typeof node.value === 'string' ? node.value : ''
      if (value.trim() !== '' && COPY_TEXT.test(value)) {
        report(ctx, 'jsx-text', node, value.trim())
      }
      break
    }
    case 'JSXElement':
    case 'JSXFragment': {
      const children = node.children
      if (Array.isArray(children)) {
        for (const child of children) {
          if (isNode(child) && child.type === 'JSXExpressionContainer') {
            for (const text of expressionCopyTexts(child.expression)) {
              report(ctx, 'jsx-text', child, text)
            }
          }
        }
      }
      break
    }
    case 'JSXAttribute': {
      const name = identifierName(node.name)
      if (name === null || !COPY_ATTRIBUTES.has(name)) {
        break
      }
      const value = node.value
      const expression = isNode(value) && value.type === 'JSXExpressionContainer' ? value.expression : value
      for (const text of expressionCopyTexts(expression)) {
        report(ctx, 'jsx-attribute', node, text)
      }
      break
    }
    case 'CallExpression': {
      const args = callArguments(node)
      const callee = node.callee
      const calleeName = identifierName(callee)
      if (calleeName === 'titleMeta') {
        const text = literalText(args[0])
        if (text !== null && !MESSAGE_ID.test(text.trim())) {
          report(ctx, 'title-meta', node, text)
          if (isNode(args[0])) {
            ctx.hanCoveredNodes.add(args[0])
          }
        }
      }
      if (isNode(callee) && callee.type === 'MemberExpression') {
        const objectName = identifierName(callee.object)
        const propertyName = identifierName(callee.property)
        if (objectName === 'toast') {
          const text = literalText(args[0])
          if (text !== null && COPY_TEXT.test(text)) {
            report(ctx, 'toast', node, text)
            if (isNode(args[0])) {
              ctx.hanCoveredNodes.add(args[0])
            }
          }
        }
        if (propertyName !== null && propertyName.startsWith('toLocale') && isAbsentLocaleArgument(args[0])) {
          report(ctx, 'to-locale', node, `${objectName ?? '…'}.${propertyName}()`)
        }
      }
      break
    }
    case 'NewExpression': {
      if (identifierName(node.callee) === 'DomainError') {
        const messageArg = callArguments(node)[1]
        const text = literalText(messageArg)
        if (text !== null && COPY_TEXT.test(text)) {
          report(ctx, 'domain-error', node, text)
          if (isNode(messageArg)) {
            ctx.hanCoveredNodes.add(messageArg)
          }
        }
      }
      break
    }
    case 'Literal': {
      if (typeof node.value !== 'string') {
        break
      }
      if (isKnownLocaleValue(node.value) && node.value.trim() !== '') {
        report(ctx, 'hardcoded-locale', node, node.value)
      }
      if (!hanCopyStore && ctx.jsxCopyCovered !== true && !ctx.hanCoveredNodes.has(node) && HAN_TEXT.test(node.value)) {
        report(ctx, 'han-literal', node, node.value)
      }
      break
    }
    case 'TemplateLiteral': {
      const text = exactText(node)
      if (text !== null && text.trim() !== '' && isKnownLocaleValue(text)) {
        report(ctx, 'hardcoded-locale', node, text)
      }
      const rendered = templateQuasis(node)?.text ?? null
      if (
        !hanCopyStore &&
        ctx.jsxCopyCovered !== true &&
        !ctx.hanCoveredNodes.has(node) &&
        rendered !== null &&
        HAN_TEXT.test(rendered)
      ) {
        report(ctx, 'han-literal', node, rendered)
      }
      break
    }
  }

  const childCtx: VisitContext =
    node.type === 'JSXElement' || node.type === 'JSXFragment' || node.type === 'JSXAttribute'
      ? { ...ctx, jsxCopyCovered: true }
      : ctx
  for (const [key, value] of Object.entries(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') {
      continue
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          visit(item, childCtx)
        }
      }
    } else if (isNode(value)) {
      visit(value, childCtx)
    }
  }
}

export function scanSourceForI18nLiterals(source: string, file: string): ScanViolation[] {
  if (isContentStoreFile(file)) {
    return []
  }
  const violations: ScanViolation[] = []
  const program = parseAst(source, { lang: file.endsWith('.tsx') ? 'tsx' : 'ts' }, file)
  visit(program as unknown as AstNode, {
    lineStarts: lineStartOffsets(source),
    file,
    violations,
    hanCoveredNodes: new WeakSet(),
    hanCopyStore: isHanCopyStore(file),
  })
  return violations
}

export function applyAllowlist(
  violations: readonly ScanViolation[],
  allowlist: readonly ScanAllowlistEntry[],
): { violations: ScanViolation[]; allowlisted: ScanViolation[] } {
  const kept: ScanViolation[] = []
  const exempt: ScanViolation[] = []
  for (const violation of violations) {
    const matched = allowlist.some(
      (entry) =>
        (violation.file === entry.path || violation.file.startsWith(`${entry.path}/`)) &&
        (entry.rules === undefined || entry.rules.includes(violation.rule)) &&
        (entry.text === undefined || violation.text.trim() === entry.text),
    )
    if (matched) {
      exempt.push(violation)
    } else {
      kept.push(violation)
    }
  }
  return { violations: kept, allowlisted: exempt }
}

function toPosixPath(path: string): string {
  return path.split(sep).join('/')
}

function isScannableFile(path: string): boolean {
  return /\.(ts|tsx)$/.test(path) && !path.endsWith('.d.ts')
}

function collectFiles(root: string, cwd: string): string[] {
  const absolute = join(cwd, root)
  if (statSync(absolute).isFile()) {
    return isScannableFile(absolute) ? [toPosixPath(relative(cwd, absolute))] : []
  }
  const found: string[] = []
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (entry.isFile() && isScannableFile(entry.name)) {
        found.push(toPosixPath(relative(cwd, full)))
      }
    }
  }
  walk(absolute)
  return found
}

export function scanI18nLiterals(options: ScanOptions): ScanResult {
  const cwd = process.cwd()
  const discovered = [...new Set(options.roots.flatMap((root) => collectFiles(root, cwd)))].sort()
  const skippedFiles = discovered.filter((file) => isContentStoreFile(file))
  const scannedFiles = discovered.filter((file) => !isContentStoreFile(file))
  const violations: ScanViolation[] = []
  for (const file of scannedFiles) {
    violations.push(...scanSourceForI18nLiterals(readFileSync(join(cwd, file), 'utf8'), file))
  }
  const filtered = applyAllowlist(violations, options.allowlist ?? [])
  return { violations: filtered.violations, allowlisted: filtered.allowlisted, scannedFiles, skippedFiles }
}
