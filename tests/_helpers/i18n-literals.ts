// AST scanner behind tests/unit/arch/ui-i18n-literals.test.ts.
//
// The rule set is deliberately small and precise — a cheap text/regex grep
// would either miss copy or drown in false positives. Every rule maps to one
// syntax position where interface copy (or a hardcoded locale) can hide:
//
//   jsx-text          JSX children — text nodes AND expression children
//                     (`{'保存'}`, {`保存 ${name}`}, `{ok ? '保存' : '取消'}`)
//   jsx-attribute     aria-label / placeholder / title / alt literals
//   title-meta        `titleMeta('…')` arguments
//   toast             `toast.*('…')` messages
//   domain-error      `new DomainError('CODE', '…')` user-facing messages
//   to-locale         `toLocale*()` with no meaningful locale (omitted,
//                     `undefined`, `void 0`, `[]`)
//   hardcoded-locale  exact literals naming a supported locale or one of its
//                     aliases (interpolated templates never match)
//
// Template literals are inspected with each interpolation replaced by a marker,
// so `保存 ${name}` is still copy; a `=== 'admin'` comparison operand is not.
// Exemptions are file/rule/snippet exact — never a blanket directory skip.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { parseAst } from 'vite'

import { isKnownLocaleValue } from '@/shared/i18n/locales'

export type ScanRule =
  | 'jsx-text'
  | 'jsx-attribute'
  | 'title-meta'
  | 'toast'
  | 'domain-error'
  | 'to-locale'
  | 'hardcoded-locale'

export interface ScanViolation {
  rule: ScanRule
  /** Repo-relative, POSIX-separated path. */
  file: string
  line: number
  column: number
  text: string
}

export interface ScanAllowlistEntry {
  /** Repo-relative file path, or a directory prefix (matched as `path/…`). */
  path: string
  /** Restrict the exemption to these rules; omit to exempt every rule in the path. */
  rules?: readonly ScanRule[]
  /** Restrict the exemption to a match whose trimmed text equals this snippet. */
  text?: string
}

export interface ScanOptions {
  /** Repo-relative files or directory prefixes to scan. */
  roots: readonly string[]
  allowlist?: readonly ScanAllowlistEntry[]
}

export interface ScanResult {
  violations: ScanViolation[]
  allowlisted: ScanViolation[]
  scannedFiles: string[]
}

/** Latin letters, accented Latin, Greek/Cyrillic, Han, Kana, Hangul. */
const COPY_TEXT =
  /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/

const COPY_ATTRIBUTES = new Set(['aria-label', 'placeholder', 'title', 'alt'])

interface AstNode {
  type: string
  start: number
  end: number
  [key: string]: unknown
}

function isNode(value: unknown): value is AstNode {
  return value !== null && typeof value === 'object' && typeof (value as AstNode).type === 'string'
}

function positionAt(source: string, offset: number): { line: number; column: number } {
  let line = 1
  let lineStart = 0
  for (let index = 0; index < offset && index < source.length; index += 1) {
    if (source[index] === '\n') {
      line += 1
      lineStart = index + 1
    }
  }
  return { line, column: offset - lineStart + 1 }
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

/** Placeholder inserted for an interpolation so copy around it stays visible. */
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

/**
 * The literal copy a node carries: a string literal verbatim, a template with
 * each interpolation replaced by a marker (so `` `保存 ${name}` `` still reads
 * as copy), or a JSX expression wrapper around either.
 */
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

/**
 * Exact text only when the node carries no interpolation — used for locale
 * literals, where `zh-${x}` must never match but `` `zh-CN` `` must.
 */
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

/**
 * Copy-bearing strings inside a JSX child expression. The expression's own
 * branches are followed (`? :`, `&&`, `+` chains, `as` casts) so neither arm
 * of a conditional can hide copy; comparisons keep their operands out of
 * scope (an `=== 'admin'` test is not interface copy).
 */
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

/** `toLocale*()` with no meaningful locale: omitted, `undefined`, `void 0`, or `[]`. */
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

function report(
  violations: ScanViolation[],
  source: string,
  file: string,
  rule: ScanRule,
  node: AstNode,
  text: string,
): void {
  const { line, column } = positionAt(source, node.start)
  violations.push({ rule, file, line, column, text })
}

function visit(node: AstNode, ctx: { source: string; file: string; violations: ScanViolation[] }): void {
  const { source, file, violations } = ctx

  switch (node.type) {
    case 'JSXText': {
      const value = typeof node.value === 'string' ? node.value : ''
      if (value.trim() !== '' && COPY_TEXT.test(value)) {
        report(violations, source, file, 'jsx-text', node, value.trim())
      }
      break
    }
    case 'JSXElement':
    case 'JSXFragment': {
      // Children that are strings, not attributes: `{'保存'}` / {`保存 ${name}`}
      // / `{ok ? '保存' : '取消'}`. Attribute values are handled by JSXAttribute,
      // so nothing is reported twice.
      const children = node.children
      if (Array.isArray(children)) {
        for (const child of children) {
          if (isNode(child) && child.type === 'JSXExpressionContainer') {
            for (const text of expressionCopyTexts(child.expression)) {
              report(violations, source, file, 'jsx-text', child, text)
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
      // `alt="封面图"` / `placeholder={`请输入`}` / `title={ok ? '保存' : '取消'}`:
      // the expression helper covers every branch and filters non-copy text.
      const value = node.value
      const expression = isNode(value) && value.type === 'JSXExpressionContainer' ? value.expression : value
      for (const text of expressionCopyTexts(expression)) {
        report(violations, source, file, 'jsx-attribute', node, text)
      }
      break
    }
    case 'CallExpression': {
      const args = callArguments(node)
      const callee = node.callee
      const calleeName = identifierName(callee)
      if (calleeName === 'titleMeta') {
        const text = literalText(args[0])
        if (text !== null) {
          report(violations, source, file, 'title-meta', node, text)
        }
      }
      if (isNode(callee) && callee.type === 'MemberExpression') {
        const objectName = identifierName(callee.object)
        const propertyName = identifierName(callee.property)
        if (objectName === 'toast') {
          const text = literalText(args[0])
          if (text !== null && COPY_TEXT.test(text)) {
            report(violations, source, file, 'toast', node, text)
          }
        }
        if (propertyName !== null && propertyName.startsWith('toLocale') && isAbsentLocaleArgument(args[0])) {
          report(violations, source, file, 'to-locale', node, `${objectName ?? '…'}.${propertyName}()`)
        }
      }
      break
    }
    case 'NewExpression': {
      if (identifierName(node.callee) === 'DomainError') {
        const text = literalText(callArguments(node)[1])
        if (text !== null && COPY_TEXT.test(text)) {
          report(violations, source, file, 'domain-error', node, text)
        }
      }
      break
    }
    case 'Literal': {
      if (typeof node.value === 'string' && isKnownLocaleValue(node.value) && node.value.trim() !== '') {
        report(violations, source, file, 'hardcoded-locale', node, node.value)
      }
      break
    }
    case 'TemplateLiteral': {
      // Only an interpolation-free template is an exact locale literal.
      const text = exactText(node)
      if (text !== null && text.trim() !== '' && isKnownLocaleValue(text)) {
        report(violations, source, file, 'hardcoded-locale', node, text)
      }
      break
    }
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') {
      continue
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          visit(item, ctx)
        }
      }
    } else if (isNode(value)) {
      visit(value, ctx)
    }
  }
}

/** Scan one source text. `file` only affects the parser dialect and reported paths. */
export function scanSourceForI18nLiterals(source: string, file: string): ScanViolation[] {
  const violations: ScanViolation[] = []
  // `parseAst` throws on a syntax error — a scan that silently skipped a file
  // would be worse than no scan at all.
  const program = parseAst(source, { lang: file.endsWith('.tsx') ? 'tsx' : 'ts' }, file)
  visit(program as unknown as AstNode, { source, file, violations })
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

/** Expand one root — a directory (recursive) or a single file — into repo-relative paths. */
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

/** Scan every production source file under `roots`. */
export function scanI18nLiterals(options: ScanOptions): ScanResult {
  const cwd = process.cwd()
  const scannedFiles = [...new Set(options.roots.flatMap((root) => collectFiles(root, cwd)))].sort()
  const violations: ScanViolation[] = []
  for (const file of scannedFiles) {
    violations.push(...scanSourceForI18nLiterals(readFileSync(join(cwd, file), 'utf8'), file))
  }
  const filtered = applyAllowlist(violations, options.allowlist ?? [])
  return { violations: filtered.violations, allowlisted: filtered.allowlisted, scannedFiles }
}
