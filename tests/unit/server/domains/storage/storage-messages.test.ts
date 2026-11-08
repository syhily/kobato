import { describe, expect, it } from 'vitest'

import type { ErrorMessageParams } from '@/shared/contracts/api-error'
import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// Storage locking / S3 migration / backend copy errors across all four locales.
// The descriptor key is the stable identity the client and the migration UI
// match; no locale sees a raw id.
interface Case {
  key: UiMessageId
  params?: ErrorMessageParams
  messages: Record<AppLocale, string>
}

const PARAM_CASES: Case[] = [
  {
    key: 'storage.error.snapshotMissing',
    params: { side: 'target' },
    messages: {
      'en-US': 'The migration row is missing its target snapshot; cannot continue',
      'zh-CN': '迁移行缺少目标配置快照，无法继续',
      'zh-TW': '遷移列缺少目標設定快照，無法繼續',
      'zh-HK': '遷移列缺少目標設定快照，無法繼續',
    },
  },
  {
    key: 'storage.error.objectTooLarge',
    params: { size: 1024, max: 512 },
    messages: {
      'en-US': 'The S3 object is too large (1024 bytes), over the 512-byte limit',
      'zh-CN': 'S3 对象过大 (1024 字节)，超出 512 字节限制',
      'zh-TW': 'S3 物件過大 (1024 位元組)，超出 512 位元組限制',
      'zh-HK': 'S3 物件過大 (1024 位元組)，超出 512 位元組限制',
    },
  },
  {
    key: 'storage.error.objectStreamTooLarge',
    params: { max: 512 },
    messages: {
      'en-US': 'The S3 object stream exceeded the 512-byte limit',
      'zh-CN': 'S3 对象流超出 512 字节限制',
      'zh-TW': 'S3 物件串流超出 512 位元組限制',
      'zh-HK': 'S3 物件串流超出 512 位元組限制',
    },
  },
  {
    key: 'storage.error.localFileTooLarge',
    params: { size: 2048, max: 1024 },
    messages: {
      'en-US': 'The local file is too large (2048 bytes), over the 1024-byte limit',
      'zh-CN': '本地文件过大 (2048 字节)，超出 1024 字节限制',
      'zh-TW': '本機檔案過大 (2048 位元組)，超出 1024 位元組限制',
      'zh-HK': '本機檔案過大 (2048 位元組)，超出 1024 位元組限制',
    },
  },
  {
    key: 'storage.error.copyFailed',
    params: { attempts: 3, key: 'images/a.png', message: 'timeout' },
    messages: {
      'en-US': 'Failed to copy object (retried 3 times): images/a.png — timeout',
      'zh-CN': '复制对象失败（已重试 3 次）: images/a.png — timeout',
      'zh-TW': '複製物件失敗（已重試 3 次）: images/a.png — timeout',
      'zh-HK': '複製物件失敗（已重試 3 次）: images/a.png — timeout',
    },
  },
]

// Placeholder-free keys: every locale must resolve to a finished sentence.
const PLAIN_KEYS: UiMessageId[] = [
  'storage.error.migrationRunning',
  'storage.error.migrationUnfinished',
  'storage.error.s3NotEnabled',
  'storage.error.targetSame',
  'storage.error.noActiveMigration',
  'storage.error.noResumableMigration',
  'storage.error.alreadyComplete',
  'storage.error.siteUrlMissing',
  'storage.error.disabled',
  'storage.error.credentialsMissing',
  'storage.error.unavailable',
  'storage.error.bucketMissing',
  'storage.error.credentialsInvalid',
  'storage.error.endpointUnreachable',
  'storage.error.connectivityFailed',
]

describe('storage messages — four locales', () => {
  it.each(PARAM_CASES)('$key resolves in every locale', ({ key, params, messages }) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(createServerTranslator(locale).format(key, params)).toBe(messages[locale])
    }
  })

  it.each(PARAM_CASES)('$key keeps an English fallback with no Han characters', ({ key, params }) => {
    expect(descriptorFor(key, params).fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })

  it.each(PLAIN_KEYS)('%s resolves in every locale without leftover placeholders', (key) => {
    for (const locale of SUPPORTED_LOCALES) {
      const message = createServerTranslator(locale).format(key)
      expect(message).not.toBe('')
      expect(message).not.toMatch(/[{}]/)
    }
  })
})
