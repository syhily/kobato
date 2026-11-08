import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { kobatoInklingLabelsEnUS } from '@/shared/i18n/inkling-labels/en-US'
import { kobatoInklingLabelsZhCN } from '@/shared/i18n/inkling-labels/zh-CN'
import { kobatoInklingLabelsZhHK } from '@/shared/i18n/inkling-labels/zh-HK'
import { kobatoInklingLabelsZhTW } from '@/shared/i18n/inkling-labels/zh-TW'
import { uiMessagesEnUS } from '@/shared/i18n/messages/ui/en-US'
import { uiMessagesZhCN } from '@/shared/i18n/messages/ui/zh-CN'
import { uiMessagesZhHK } from '@/shared/i18n/messages/ui/zh-HK'
import { uiMessagesZhTW } from '@/shared/i18n/messages/ui/zh-TW'

// The glossary is the human-readable regional terminology baseline. This suite
// pins ONLY the representative terms the document explicitly commits to — never
// all 247 natural zh-HK/zh-TW differences, and never the requirement that the
// two locales must differ (identical wording is often correct).
//
// Two layers:
//   1. A small direct assertion set: the decisions that must survive even if
//      someone rewrites the document.
//   2. Document parity: every row inside the glossary's machine-readable
//      anchor tables must match the four catalogs byte-for-byte.

const UI: Record<string, Record<string, string>> = {
  'en-US': uiMessagesEnUS,
  'zh-CN': uiMessagesZhCN,
  'zh-HK': uiMessagesZhHK,
  'zh-TW': uiMessagesZhTW,
}

const INKLING: Record<string, Record<string, string>> = {
  'en-US': kobatoInklingLabelsEnUS,
  'zh-CN': kobatoInklingLabelsZhCN,
  'zh-HK': kobatoInklingLabelsZhHK,
  'zh-TW': kobatoInklingLabelsZhTW,
}

const GLOSSARY = readFileSync(resolve(process.cwd(), 'docs/i18n/glossary.md'), 'utf8')

type AnchorRow = {
  key: string
  'en-US': string
  'zh-CN': string
  'zh-HK': string
  'zh-TW': string
}

function unquote(cell: string, line: string): string {
  if (!cell.startsWith('`') || !cell.endsWith('`') || cell.length < 2) {
    throw new Error(`Glossary cell is not backticked: ${line}`)
  }
  return cell.slice(1, -1)
}

/** Rows between `<!-- glossary:<name>:start -->` and its end marker. */
function anchorRows(name: 'ui' | 'inkling'): AnchorRow[] {
  const start = `<!-- glossary:${name}:start -->`
  const end = `<!-- glossary:${name}:end -->`
  const startIndex = GLOSSARY.indexOf(start)
  const endIndex = GLOSSARY.indexOf(end)
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`Glossary anchor block "${name}" is missing or malformed`)
  }

  const rows: AnchorRow[] = []
  for (const rawLine of GLOSSARY.slice(startIndex + start.length, endIndex).split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith('|')) {
      continue
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim())
    if (cells.length !== 5) {
      throw new Error(`Glossary row does not have 5 columns: ${line}`)
    }
    if (cells[0] === 'Key' || cells[0].startsWith('---')) {
      continue
    }
    rows.push({
      key: unquote(cells[0], line),
      'en-US': unquote(cells[1], line),
      'zh-CN': unquote(cells[2], line),
      'zh-HK': unquote(cells[3], line),
      'zh-TW': unquote(cells[4], line),
    })
  }
  return rows
}

/**
 * Representative decisions from `docs/i18n/glossary.md` §3–§7. Kept deliberately
 * small: the document is the contract, and the full catalog is never frozen.
 */
const REGIONAL_PINS: Record<string, Omit<AnchorRow, 'key' | 'en-US'>> = {
  'common.action.reload': { 'zh-CN': '刷新', 'zh-HK': '重新載入', 'zh-TW': '重新整理' },
  'public.comments.email': { 'zh-CN': '邮箱', 'zh-HK': '電郵', 'zh-TW': '電子郵件' },
  'public.comments.submit': { 'zh-CN': '发表评论', 'zh-HK': '發表評論', 'zh-TW': '發表留言' },
  'public.comments.title': { 'zh-CN': '评论', 'zh-HK': '留言', 'zh-TW': '留言' },
  'public.like.like': { 'zh-CN': '点赞', 'zh-HK': '讚好', 'zh-TW': '按讚' },
  'admin.comments.title': { 'zh-CN': '评论管理', 'zh-HK': '留言管理', 'zh-TW': '評論管理' },
  'admin.categories.form.namePlaceholder': {
    'zh-CN': '例：编程',
    'zh-HK': '例：編程',
    'zh-TW': '例：程式設計',
  },
  'admin.dashboard.greeting.morning': {
    'zh-CN': '早上好，新的一天开始啦',
    'zh-HK': '早晨，新嘅一日開始喇',
    'zh-TW': '早安，新的一天開始啦',
  },
  'notifications.compose.noUsers': {
    'zh-CN': '没有匹配的用户',
    'zh-HK': '沒有相符嘅使用者',
    'zh-TW': '沒有相符的使用者',
  },
  'admin.settings.backup.restore.networkError': {
    'zh-CN': '网络错误，上传失败',
    'zh-HK': '網絡錯誤，上傳失敗',
    'zh-TW': '網路錯誤，上傳失敗',
  },
}

const INKLING_PINS: Record<string, Omit<AnchorRow, 'key' | 'en-US'>> = {
  'toolbar.bold': { 'zh-CN': '加粗', 'zh-HK': '粗體', 'zh-TW': '粗體' },
  'menu.codeblock.label': { 'zh-CN': '代码块', 'zh-HK': '程式碼區塊', 'zh-TW': '程式碼區塊' },
  'menu.header.label': { 'zh-CN': '页头', 'zh-HK': '頁首', 'zh-TW': '頁首' },
}

describe('i18n glossary — representative regional terms', () => {
  it('pins the agreed HK/TW decisions in the UI catalogs', () => {
    for (const [key, expected] of Object.entries(REGIONAL_PINS)) {
      expect(UI['zh-CN'][key], `zh-CN ${key}`).toBe(expected['zh-CN'])
      expect(UI['zh-HK'][key], `zh-HK ${key}`).toBe(expected['zh-HK'])
      expect(UI['zh-TW'][key], `zh-TW ${key}`).toBe(expected['zh-TW'])
    }
  })

  it('pins the shared Inkling editor terms', () => {
    for (const [key, expected] of Object.entries(INKLING_PINS)) {
      expect(INKLING['zh-CN'][key], `zh-CN ${key}`).toBe(expected['zh-CN'])
      expect(INKLING['zh-HK'][key], `zh-HK ${key}`).toBe(expected['zh-HK'])
      expect(INKLING['zh-TW'][key], `zh-TW ${key}`).toBe(expected['zh-TW'])
    }
  })

  it('keeps identical HK/TW wording legal (no forced divergence)', () => {
    // Both of these are intentionally identical in the two Traditional
    // catalogs. A future "differentiate the locales" cleanup must not touch them.
    expect(UI['zh-HK']['public.comments.title']).toBe(UI['zh-TW']['public.comments.title'])
    expect(INKLING['zh-HK']['toolbar.bold']).toBe(INKLING['zh-TW']['toolbar.bold'])
  })

  it('does not freeze the full natural-difference set', () => {
    // Guard the guard: the anchor tables stay representative, not exhaustive.
    expect(anchorRows('ui').length).toBeLessThan(80)
    expect(anchorRows('inkling').length).toBeLessThan(20)
  })
})

describe('i18n glossary — document/catalog parity', () => {
  it('has a UI anchor row for every representative decision', () => {
    const keys = new Set(anchorRows('ui').map((row) => row.key))
    for (const key of Object.keys(REGIONAL_PINS)) {
      expect(keys.has(key), `glossary UI anchor: ${key}`).toBe(true)
    }
  })

  it('has an Inkling anchor row for every pinned editor term', () => {
    const keys = new Set(anchorRows('inkling').map((row) => row.key))
    for (const key of Object.keys(INKLING_PINS)) {
      expect(keys.has(key), `glossary Inkling anchor: ${key}`).toBe(true)
    }
  })

  it('matches every UI anchor row against the four catalogs', () => {
    for (const row of anchorRows('ui')) {
      expect(UI['en-US'][row.key], `en-US ${row.key}`).toBe(row['en-US'])
      expect(UI['zh-CN'][row.key], `zh-CN ${row.key}`).toBe(row['zh-CN'])
      expect(UI['zh-HK'][row.key], `zh-HK ${row.key}`).toBe(row['zh-HK'])
      expect(UI['zh-TW'][row.key], `zh-TW ${row.key}`).toBe(row['zh-TW'])
    }
  })

  it('matches every Inkling anchor row against the four label tables', () => {
    for (const row of anchorRows('inkling')) {
      expect(INKLING['en-US'][row.key], `en-US ${row.key}`).toBe(row['en-US'])
      expect(INKLING['zh-CN'][row.key], `zh-CN ${row.key}`).toBe(row['zh-CN'])
      expect(INKLING['zh-HK'][row.key], `zh-HK ${row.key}`).toBe(row['zh-HK'])
      expect(INKLING['zh-TW'][row.key], `zh-TW ${row.key}`).toBe(row['zh-TW'])
    }
  })
})
