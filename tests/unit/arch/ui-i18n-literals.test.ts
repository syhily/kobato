/**
 * Hardcoded-UI-copy guard (plan 001, Step 1).
 *
 * Interface copy, validation messages, toast/DomainError text, hardcoded
 * locales and locale-less `toLocale*()` calls must not reach production source:
 * every one of them belongs to the message catalogs so all four locales stay
 * in step. The scanner is an AST walk (see `#/_helpers/i18n-literals`) with an
 * exact file/rule/snippet allowlist — never a blanket directory skip.
 *
 * `SCAN_ROOTS` grows with each migration slice and the final slice covers
 * `src/**`; exemptions are added per finding, with a reason.
 */

import { describe, expect, it } from 'vitest'

import {
  applyAllowlist,
  scanI18nLiterals,
  scanSourceForI18nLiterals,
  type ScanAllowlistEntry,
} from '#/_helpers/i18n-literals'

const SCAN_ROOTS = [
  // The i18n foundation itself (this slice).
  'src/shared/i18n',
  'src/server/infra/i18n.ts',
] as const

const ALLOWLIST: readonly ScanAllowlistEntry[] = [
  // The locale module names every supported tag and alias by design — it IS
  // the single source of truth the rule checks against.
  { path: 'src/shared/i18n/locales.ts', rules: ['hardcoded-locale'] },
  // The catalog aggregator keys its per-locale maps and its English fallback
  // by tag; those literals are the catalog identity, not UI copy.
  { path: 'src/shared/i18n/catalog.ts', rules: ['hardcoded-locale'] },
]

function rules(source: string, file = 'fixture.tsx'): string[] {
  return scanSourceForI18nLiterals(source, file).map((violation) => violation.rule)
}

describe('production sources', () => {
  it('carry no hardcoded UI copy inside the migrated roots', () => {
    const result = scanI18nLiterals({ roots: SCAN_ROOTS, allowlist: ALLOWLIST })

    expect(result.scannedFiles.length).toBeGreaterThan(0)
    expect(result.violations).toEqual([])
    // The allowlist is exact: only the tagged rules in the two named files are exempt.
    expect(result.allowlisted.length).toBeGreaterThan(0)
    expect(new Set(result.allowlisted.map((violation) => violation.rule))).toEqual(new Set(['hardcoded-locale']))
    expect(new Set(result.allowlisted.map((violation) => violation.file))).toEqual(
      new Set(['src/shared/i18n/locales.ts', 'src/shared/i18n/catalog.ts']),
    )
  })

  it('reaches every file under the roots, including nested catalogs', () => {
    const { scannedFiles } = scanI18nLiterals({ roots: SCAN_ROOTS })

    expect(scannedFiles).toContain('src/shared/i18n/locales.ts')
    expect(scannedFiles).toContain('src/shared/i18n/messages/ui/en-US.ts')
    expect(scannedFiles).toContain('src/shared/i18n/messages/server/zh-TW.ts')
  })
})

describe('scanner rules', () => {
  it('flags JSX text but not punctuation or numeric badges', () => {
    expect(rules('export function A() { return <div>保存</div> }')).toEqual(['jsx-text'])
    expect(rules('export function A() { return <div>Hello there</div> }')).toEqual(['jsx-text'])
    expect(rules('export function A() { return <div>404</div> }')).toEqual([])
    expect(rules('export function A() { return <div>{label}</div> }')).toEqual([])
  })

  it('flags copy in JSX expression children', () => {
    expect(rules("export function A() { return <div>{'保存'}</div> }")).toEqual(['jsx-text'])
    expect(rules('export function A() { return <div>{`保存 ${name}`}</div> }')).toEqual(['jsx-text'])
    expect(rules("export function A() { return <div>{ok ? '保存' : '取消'}</div> }")).toEqual(['jsx-text', 'jsx-text'])
    expect(rules("export function A() { return <div>{'保存' + name}</div> }")).toEqual(['jsx-text'])
    expect(rules("export function A() { return <div>{name === 'admin' ? label : name}</div> }")).toEqual([])
    expect(rules('export function A() { return <div>{count}</div> }')).toEqual([])
  })

  it('flags copy-bearing JSX attributes, including the expression form', () => {
    expect(rules('export function A() { return <img alt="封面图" /> }')).toEqual(['jsx-attribute'])
    expect(rules('export function A() { return <input placeholder={`请输入`} /> }')).toEqual(['jsx-attribute'])
    expect(rules('export function A() { return <button aria-label="删除" /> }')).toEqual(['jsx-attribute'])
    // Decorative images and technical class names are not copy.
    expect(rules('export function A() { return <img alt="" className="size-4" /> }')).toEqual([])
  })

  it('flags interpolated attribute copy exactly once (no double report)', () => {
    expect(rules('export function A() { return <img alt={`封面 ${title}`} /> }')).toEqual(['jsx-attribute'])
    expect(rules("export function A() { return <div title={ok ? '保存' : '取消'} /> }")).toEqual([
      'jsx-attribute',
      'jsx-attribute',
    ])
    expect(rules('export function A() { return <div title={copy} /> }')).toEqual([])
  })

  it('accepts only message ids as titleMeta() arguments', () => {
    expect(rules("export const meta = () => titleMeta('登录')")).toEqual(['title-meta'])
    expect(rules('export const meta = () => titleMeta(`登录页`)')).toEqual(['title-meta'])
    expect(rules("export const meta = () => titleMeta('meta.title.auth.signin')")).toEqual([])
    expect(rules('export const meta = () => titleMeta(pageTitle)')).toEqual([])
  })

  it('flags toast messages', () => {
    expect(rules("export function A() { toast.error('设置未保存') }")).toEqual(['toast'])
    expect(rules('export function A() { toast.error(`设置未保存：${reason}`) }')).toEqual(['toast'])
    expect(rules('export function A() { toast.success(message) }')).toEqual([])
  })

  it('flags DomainError user-facing messages', () => {
    expect(rules("export function A() { throw new DomainError('BAD_REQUEST', '设置数据无效') }")).toEqual([
      'domain-error',
    ])
    expect(rules("export function A() { throw new DomainError('BAD_REQUEST', `设置数据无效：${detail}`) }")).toEqual([
      'domain-error',
    ])
    expect(rules("export function A() { throw new DomainError('CONFLICT', reason) }")).toEqual([])
    // English copy is copy: technical text is allowlisted per site later, never
    // exempted by the rule itself.
    expect(rules("export function A() { throw new DomainError('INTERNAL', 'row failed') }")).toEqual(['domain-error'])
    expect(rules("export function A() { throw new DomainError('INTERNAL', String(code)) }")).toEqual([])
  })

  it('flags toLocale*() calls without a meaningful locale', () => {
    expect(rules('export const a = (d: Date) => d.toLocaleDateString()')).toEqual(['to-locale'])
    expect(rules('export const a = (d: Date) => d.toLocaleString(undefined, { hour: "2-digit" })')).toEqual([
      'to-locale',
    ])
    expect(rules('export const a = (d: Date) => d.toLocaleString(void 0, options)')).toEqual(['to-locale'])
    expect(rules('export const a = (d: Date) => d.toLocaleString([], options)')).toEqual(['to-locale'])
    expect(rules("export const a = (d: Date) => d.toLocaleDateString('zh-CN')")).toEqual(['hardcoded-locale'])
    // A real locale argument (variable or literal) is not this rule's target.
    expect(rules('export const a = (d: Date) => d.toLocaleDateString(locale)')).toEqual([])
    expect(rules('export const a = (d: Date) => d.toLocaleDateString(locales, options)')).toEqual([])
  })

  it('flags literals that name a supported locale or one of its aliases', () => {
    expect(rules("export const tag = 'zh-CN'", 'fixture.ts')).toEqual(['hardcoded-locale'])
    expect(rules("export const tag = 'zh-Hant-TW'", 'fixture.ts')).toEqual(['hardcoded-locale'])
    expect(rules("export const tag = 'en'", 'fixture.ts')).toEqual(['hardcoded-locale'])
    expect(rules('export const tag = `zh-CN`', 'fixture.ts')).toEqual(['hardcoded-locale'])
    expect(rules("export const path = '/zh-CN/posts'", 'fixture.ts')).toEqual([])
  })

  it('never treats an interpolated locale template as an exact locale literal', () => {
    expect(rules('export const tag = `zh-${region}`', 'fixture.ts')).toEqual([])
    expect(rules('export const tag = `${base}-CN`', 'fixture.ts')).toEqual([])
  })

  it('reports a stable 1-based line and column', () => {
    const [violation] = scanSourceForI18nLiterals('type A = 1\nexport const tag = "zh-CN"\n', 'fixture.ts')

    expect(violation?.line).toBe(2)
    expect(violation?.column).toBeGreaterThan(1)
  })
})

describe('allowlist', () => {
  const violations = scanSourceForI18nLiterals(
    "export const a = 'zh-CN'\nexport const b = 'zh-TW'\nexport function C() { return <p>保存</p> }\n",
    'src/shared/i18n/sample.tsx',
  )

  it('exempts only the listed rule for a path', () => {
    const result = applyAllowlist(violations, [{ path: 'src/shared/i18n/sample.tsx', rules: ['hardcoded-locale'] }])

    expect(result.allowlisted).toHaveLength(2)
    expect(result.violations.map((violation) => violation.rule)).toEqual(['jsx-text'])
  })

  it('exempts nothing outside the path prefix', () => {
    const result = applyAllowlist(violations, [{ path: 'src/ui/other.tsx' }])

    expect(result.allowlisted).toHaveLength(0)
  })

  it('narrows to an exact snippet when one is given', () => {
    const result = applyAllowlist(violations, [{ path: 'src/shared/i18n', rules: ['hardcoded-locale'], text: 'zh-TW' }])

    expect(result.allowlisted.map((violation) => violation.text)).toEqual(['zh-TW'])
    expect(result.violations).toHaveLength(2)
  })
})
