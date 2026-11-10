// AST scanner behind tests/unit/arch/log-message-literals.test.ts.
// The outbound log projection (src/server/infra/trace/log-record.ts) only accepts a
// static message: non-HTTP bodies are read from `msg` verbatim and marker-bearing
// messages are dropped, so an interpolated or concatenated message silently loses
// its detail — and any value baked into it.
// Logger calls are matched by method name, receiver-agnostic: any
// debug/info/warn/error/fatal member call counts unless the receiver is `console`,
// a Web Streams controller, or a bare plugin/handler `this`.
// Two signatures: the facade is `(message, context?)`; the raw Pino `root` export
// is `(mergeObject, message)`, so a first-argument object is context and a missing
// or non-static second argument fails closed.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { parseAst } from 'vite'

export type LogMessageRule = 'dynamic-message' | 'marker-message' | 'dynamic-option-message'

export interface LogMessageViolation {
  rule: LogMessageRule
  /** Repo-relative, POSIX-separated path. */
  file: string
  line: number
  column: number
  /** Raw source text of the offending argument/property value. */
  text: string
}

export interface LogMessageAllowlistEntry {
  /** Repo-relative file path, or a directory prefix (matched as `path/…`). */
  path: string
  /** Restrict the exemption to these rules; omit to exempt every rule in the path. */
  rule?: LogMessageRule
  /** Restrict the exemption to a match whose source text equals this snippet. */
  text?: string
}

export interface LogMessageScanOptions {
  /** Repo-relative files or directory prefixes to scan. */
  roots: readonly string[]
  allowlist?: readonly LogMessageAllowlistEntry[]
}

export interface LogMessageScanResult {
  violations: LogMessageViolation[]
  allowlisted: LogMessageViolation[]
  scannedFiles: string[]
}

const LOG_METHODS: ReadonlySet<string> = new Set(['debug', 'info', 'warn', 'error', 'fatal'])

/** Option-shaped static messages: the value is forwarded to a logger verbatim. */
const OPTION_MESSAGE_KEYS: ReadonlySet<string> = new Set(['logMessage', 'rowThrewMessage'])

const MESSAGE_MARKERS = ['{E}', '{/E}', '[REDACTED]'] as const

/** Receivers whose `.error()`-style members are not loggers: the console, and a Web Streams controller. */
const NON_LOGGER_RECEIVER_IDENTIFIERS: ReadonlySet<string> = new Set(['console', 'controller'])

interface AstNode {
  type: string
  start: number
  end: number
  [key: string]: unknown
}

interface LiteralMessage {
  /** Rendered text (interpolations join as `…`). */
  text: string
  static: boolean
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

/** 1-based line/column from the line-start index — O(log lines), not O(offset). */
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

/** Property name of a member expression, including a literal computed key. */
function memberName(node: AstNode): string | null {
  if (node.computed === true) {
    const property = node.property
    if (isNode(property) && property.type === 'Literal' && typeof property.value === 'string') {
      return property.value
    }
    return null
  }
  return identifierName(node.property)
}

function unwrapExpression(node: unknown): AstNode | null {
  let current: unknown = node
  while (isNode(current)) {
    switch (current.type) {
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'ParenthesizedExpression':
        current = current.expression
        continue
      default:
        return current
    }
  }
  return null
}

/** The literal shape of a message argument: static string, static template, or neither. */
function literalMessage(node: unknown): LiteralMessage | null {
  const expression = unwrapExpression(node)
  if (expression === null) {
    return null
  }
  if (expression.type === 'Literal') {
    return typeof expression.value === 'string' ? { text: expression.value, static: true } : null
  }
  if (expression.type !== 'TemplateLiteral') {
    return null
  }
  const quasis = expression.quasis
  const expressions = expression.expressions
  if (!Array.isArray(quasis)) {
    return null
  }
  const parts: string[] = []
  for (const quasi of quasis) {
    const value = (quasi as { value?: { cooked?: string; raw?: string } }).value
    parts.push(value?.cooked ?? value?.raw ?? '')
  }
  return {
    text: parts.join('\u2026'),
    static: !Array.isArray(expressions) || expressions.length === 0,
  }
}

function hasMarker(text: string): boolean {
  return MESSAGE_MARKERS.some((marker) => text.includes(marker))
}

/**
 * `console.*`, `globalThis.console.*`, a Web Streams `controller.error(…)` and a
 * bare `this.error(…)` are never logger calls; `this.log.error(…)` still matches.
 */
function isNonLoggerReceiver(node: unknown): boolean {
  if (!isNode(node)) {
    return false
  }
  if (node.type === 'Identifier') {
    return NON_LOGGER_RECEIVER_IDENTIFIERS.has(node.name as string)
  }
  if (node.type === 'ThisExpression') {
    return true
  }
  if (node.type === 'MemberExpression') {
    return memberName(node) === 'console'
  }
  return false
}

function propertyKeyName(node: AstNode): string | null {
  const key = node.key
  if (isNode(key) && key.type === 'Literal' && typeof key.value === 'string') {
    return key.value
  }
  return identifierName(key)
}

interface VisitContext {
  source: string
  file: string
  lineStarts: readonly number[]
  violations: LogMessageViolation[]
  /** Local names of the raw Pino `root` export (pino's `(object, message)` signature). */
  pinoRootNames: ReadonlySet<string>
}

function report(ctx: VisitContext, rule: LogMessageRule, node: AstNode): void {
  const { line, column } = positionAt(ctx.lineStarts, node.start)
  const text = ctx.source.slice(node.start, node.end)
  ctx.violations.push({ rule, file: ctx.file, line, column, text })
}

function checkMessage(ctx: VisitContext, node: AstNode): void {
  const message = literalMessage(node)
  if (message === null || !message.static) {
    report(ctx, 'dynamic-message', node)
    return
  }
  if (hasMarker(message.text)) {
    report(ctx, 'marker-message', node)
  }
}

/**
 * Raw Pino root: a first-argument object is the merge object, so the message is the
 * second argument. Any other first argument is the message, as with the facade.
 */
function checkPinoMessage(ctx: VisitContext, args: readonly unknown[]): void {
  const first = args[0]
  if (!isNode(first)) {
    return
  }
  const head = unwrapExpression(first)
  if (head?.type === 'ObjectExpression') {
    const message = args[1]
    if (!isNode(message)) {
      report(ctx, 'dynamic-message', first)
      return
    }
    checkMessage(ctx, message)
    return
  }
  checkMessage(ctx, first)
}

function checkOptionProperty(ctx: VisitContext, node: AstNode): void {
  const key = propertyKeyName(node)
  if (key === null || !OPTION_MESSAGE_KEYS.has(key)) {
    return
  }
  const value = node.value
  if (!isNode(value)) {
    // An interface/type declaration (`logMessage: string`) carries no value.
    return
  }
  const message = literalMessage(value)
  if (message === null || !message.static) {
    report(ctx, 'dynamic-option-message', value)
    return
  }
  if (hasMarker(message.text)) {
    report(ctx, 'marker-message', value)
  }
}

function visit(node: AstNode, ctx: VisitContext): void {
  switch (node.type) {
    case 'CallExpression': {
      const callee = node.callee
      if (isNode(callee) && callee.type === 'MemberExpression') {
        const method = memberName(callee)
        if (method !== null && LOG_METHODS.has(method) && !isNonLoggerReceiver(callee.object)) {
          const args = Array.isArray(node.arguments) ? (node.arguments as readonly unknown[]) : []
          const receiver = callee.object
          if (isNode(receiver) && receiver.type === 'Identifier' && ctx.pinoRootNames.has(receiver.name as string)) {
            checkPinoMessage(ctx, args)
          } else {
            const message = args[0]
            if (isNode(message)) {
              checkMessage(ctx, message)
            }
          }
        }
      }
      break
    }
    case 'Property':
    case 'PropertyDefinition':
      checkOptionProperty(ctx, node)
      break
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

/** Local names bound to the raw Pino `root` export (only that module's `root`). */
function collectPinoRootNames(program: AstNode): Set<string> {
  const names = new Set<string>()
  const body = program.body
  if (!Array.isArray(body)) {
    return names
  }
  for (const statement of body) {
    if (!isNode(statement) || statement.type !== 'ImportDeclaration') {
      continue
    }
    const source = statement.source
    if (!isNode(source) || source.value !== '@/server/infra/logger') {
      continue
    }
    const specifiers = statement.specifiers
    if (!Array.isArray(specifiers)) {
      continue
    }
    for (const specifier of specifiers) {
      if (!isNode(specifier) || specifier.type !== 'ImportSpecifier') {
        continue
      }
      if (identifierName(specifier.imported) !== 'root') {
        continue
      }
      const local = identifierName(specifier.local)
      if (local !== null) {
        names.add(local)
      }
    }
  }
  return names
}

/** Scan one source text; `file` selects the parser dialect and the reported path. */
export function scanSourceForLogMessages(source: string, file: string): LogMessageViolation[] {
  const violations: LogMessageViolation[] = []
  // `parseAst` throws on a syntax error — a silently skipped file would be
  // worse than no scan at all.
  const program = parseAst(source, { lang: file.endsWith('.tsx') ? 'tsx' : 'ts' }, file) as unknown as AstNode
  visit(program, {
    source,
    file,
    lineStarts: lineStartOffsets(source),
    violations,
    pinoRootNames: collectPinoRootNames(program),
  })
  return violations
}

function applyAllowlist(
  violations: readonly LogMessageViolation[],
  allowlist: readonly LogMessageAllowlistEntry[],
): { violations: LogMessageViolation[]; allowlisted: LogMessageViolation[] } {
  const kept: LogMessageViolation[] = []
  const exempt: LogMessageViolation[] = []
  for (const violation of violations) {
    const matched = allowlist.some(
      (entry) =>
        (violation.file === entry.path || violation.file.startsWith(`${entry.path}/`)) &&
        (entry.rule === undefined || entry.rule === violation.rule) &&
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

/** Scan every production source file under `roots`. */
export function scanLogMessages(options: LogMessageScanOptions): LogMessageScanResult {
  const cwd = process.cwd()
  const scannedFiles = [...new Set(options.roots.flatMap((root) => collectFiles(root, cwd)))].sort()
  const violations: LogMessageViolation[] = []
  for (const file of scannedFiles) {
    violations.push(...scanSourceForLogMessages(readFileSync(join(cwd, file), 'utf8'), file))
  }
  const filtered = applyAllowlist(violations, options.allowlist ?? [])
  return { violations: filtered.violations, allowlisted: filtered.allowlisted, scannedFiles }
}
