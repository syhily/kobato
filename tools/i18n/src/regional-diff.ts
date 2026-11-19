#!/usr/bin/env node
import { kobatoInklingLabelsEnUS } from '@kobato/i18n/inkling-labels/en-US.ts'
import { kobatoInklingLabelsZhCN } from '@kobato/i18n/inkling-labels/zh-CN.ts'
import { kobatoInklingLabelsZhHK } from '@kobato/i18n/inkling-labels/zh-HK.ts'
import { kobatoInklingLabelsZhTW } from '@kobato/i18n/inkling-labels/zh-TW.ts'
import { serverMessagesEnUS } from '@kobato/i18n/messages/server/en-US.ts'
import { serverMessagesZhCN } from '@kobato/i18n/messages/server/zh-CN.ts'
import { serverMessagesZhHK } from '@kobato/i18n/messages/server/zh-HK.ts'
import { serverMessagesZhTW } from '@kobato/i18n/messages/server/zh-TW.ts'
import { uiMessagesEnUS } from '@kobato/i18n/messages/ui/en-US.ts'
import { uiMessagesZhCN } from '@kobato/i18n/messages/ui/zh-CN.ts'
import { uiMessagesZhHK } from '@kobato/i18n/messages/ui/zh-HK.ts'
import { uiMessagesZhTW } from '@kobato/i18n/messages/ui/zh-TW.ts'

type Table = Record<string, string>

interface Namespace {
  name: string
  tables: { 'en-US': Table; 'zh-CN': Table; 'zh-HK': Table; 'zh-TW': Table }
}

const NAMESPACES: Namespace[] = [
  {
    name: 'ui',
    tables: {
      'en-US': uiMessagesEnUS,
      'zh-CN': uiMessagesZhCN,
      'zh-HK': uiMessagesZhHK,
      'zh-TW': uiMessagesZhTW,
    },
  },
  {
    name: 'server',
    tables: {
      'en-US': serverMessagesEnUS,
      'zh-CN': serverMessagesZhCN,
      'zh-HK': serverMessagesZhHK,
      'zh-TW': serverMessagesZhTW,
    },
  },
  {
    name: 'inkling',
    tables: {
      'en-US': kobatoInklingLabelsEnUS,
      'zh-CN': kobatoInklingLabelsZhCN,
      'zh-HK': kobatoInklingLabelsZhHK,
      'zh-TW': kobatoInklingLabelsZhTW,
    },
  },
]

const PAIRS = [
  ['zh-CN', 'zh-HK'],
  ['zh-CN', 'zh-TW'],
  ['zh-HK', 'zh-TW'],
] as const

const args = process.argv.slice(2)
const showKeys = args.includes('--keys')
const prefixArg = args.find((arg) => arg.startsWith('--prefix='))
const prefix = prefixArg?.slice('--prefix='.length) ?? ''

if (args.includes('--help')) {
  console.log('Usage: pnpm run i18n:regional-diff [--keys] [--prefix=<key prefix>]')
  process.exit(0)
}

function differingKeys(left: Table, right: Table): string[] {
  return Object.keys(left)
    .filter((key) => key.startsWith(prefix) && left[key] !== right[key])
    .sort()
}

console.log('i18n regional diff — read-only report')
console.log(`prefix: ${prefix === '' ? '(all keys)' : prefix}`)
console.log('')

for (const namespace of NAMESPACES) {
  const keyCount = Object.keys(namespace.tables['en-US']).length
  console.log(`${namespace.name}: ${keyCount} keys per locale`)

  for (const [left, right] of PAIRS) {
    const keys = differingKeys(namespace.tables[left], namespace.tables[right])
    console.log(`  ${left} vs ${right}: ${keys.length} differing`)
    if (showKeys) {
      for (const key of keys) {
        console.log(`    ${key}`)
        console.log(`      ${left}: ${namespace.tables[left][key]}`)
        console.log(`      ${right}: ${namespace.tables[right][key]}`)
      }
    }
  }
  console.log('')
}

console.log('No catalog was modified. Differences are natural until a reviewer records a decision.')
