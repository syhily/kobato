import { describe, expect, it } from 'vitest'

import type { ErrorMessageParams } from '@/shared/contracts/api-error'
import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// Self-update job/service/pipeline errors across all four locales. The status
// boundary localizes the stored descriptor; the dialog never prints a key.
interface Case {
  key: UiMessageId
  params?: ErrorMessageParams
  messages: Record<AppLocale, string>
}

const CASES: Case[] = [
  {
    key: 'update.error.alreadyLatest',
    messages: {
      'en-US': 'You are already on the latest version',
      'zh-CN': '当前已是最新版本',
      'zh-TW': '目前已是最新版本',
      'zh-HK': '目前已是最新版本',
    },
  },
  {
    key: 'update.error.archiveHashMismatch',
    messages: {
      'en-US': 'The update package checksum did not match; the update was aborted',
      'zh-CN': '更新包校验失败，已中止',
      'zh-TW': '更新套件校驗失敗，已中止',
      'zh-HK': '更新套件校驗失敗，已中止',
    },
  },
  {
    key: 'update.error.binaryHashMismatch',
    messages: {
      'en-US': 'The update package contents failed verification; the update was aborted',
      'zh-CN': '更新包内容校验失败，已中止',
      'zh-TW': '更新套件內容校驗失敗，已中止',
      'zh-HK': '更新套件內容校驗失敗，已中止',
    },
  },
  {
    key: 'update.error.binaryMissing',
    messages: {
      'en-US': 'No executable was found inside the update package',
      'zh-CN': '更新包内未找到可执行文件',
      'zh-TW': '更新套件內未找到可執行檔',
      'zh-HK': '更新套件內未找到可執行檔',
    },
  },
  {
    key: 'update.error.downloadFailed',
    params: { status: 404 },
    messages: {
      'en-US': 'Downloading the update package failed (HTTP 404)',
      'zh-CN': '下载更新包失败（HTTP 404）',
      'zh-TW': '下載更新套件失敗（HTTP 404）',
      'zh-HK': '下載更新套件失敗（HTTP 404）',
    },
  },
  {
    key: 'update.error.extractFailed',
    messages: {
      'en-US': 'Extracting the update package failed; the update was aborted',
      'zh-CN': '更新包解压失败，已中止',
      'zh-TW': '更新套件解壓縮失敗，已中止',
      'zh-HK': '更新套件解壓縮失敗，已中止',
    },
  },
  {
    key: 'update.error.jobRunning',
    messages: {
      'en-US': 'An update task is already running',
      'zh-CN': '已有更新任务正在进行中',
      'zh-TW': '已有更新任務正在進行中',
      'zh-HK': '已有更新任務正在進行中',
    },
  },
  {
    key: 'update.error.packageTooLarge',
    params: { max: '512 MB' },
    messages: {
      'en-US': 'The update package exceeds the 512 MB size limit',
      'zh-CN': '更新包超过 512 MB 大小限制',
      'zh-TW': '更新套件超過 512 MB 大小限制',
      'zh-HK': '更新套件超過 512 MB 大小限制',
    },
  },
  {
    key: 'update.error.sidecarDownloadFailed',
    params: { status: 502 },
    messages: {
      'en-US': 'Downloading the update checksums failed (HTTP 502)',
      'zh-CN': '下载校验文件失败（HTTP 502）',
      'zh-TW': '下載校驗檔案失敗（HTTP 502）',
      'zh-HK': '下載校驗檔案失敗（HTTP 502）',
    },
  },
  {
    key: 'update.error.repositoryInvalid',
    messages: {
      'en-US': 'The configured GitHub repository is invalid',
      'zh-CN': '配置的 GitHub 仓库格式无效',
      'zh-TW': '設定的 GitHub 儲存庫格式無效',
      'zh-HK': '設定的 GitHub 儲存庫格式無效',
    },
  },
  {
    key: 'update.error.releaseFetchFailed',
    messages: {
      'en-US': 'Could not fetch the latest release from GitHub. Please try again later.',
      'zh-CN': '无法从 GitHub 获取最新版本，请稍后再试。',
      'zh-TW': '無法從 GitHub 取得最新版本，請稍後再試。',
      'zh-HK': '無法從 GitHub 取得最新版本，請稍後再試。',
    },
  },
  {
    key: 'update.error.releaseInvalidResponse',
    messages: {
      'en-US': 'GitHub returned an unexpected release response',
      'zh-CN': 'GitHub 返回了无法识别的版本信息',
      'zh-TW': 'GitHub 傳回了無法辨識的版本資訊',
      'zh-HK': 'GitHub 傳回了無法辨識的版本資訊',
    },
  },
  {
    key: 'update.error.sidecarInvalid',
    messages: {
      'en-US': 'The update checksum file is malformed',
      'zh-CN': '更新校验文件格式无效',
      'zh-TW': '更新校驗檔案格式無效',
      'zh-HK': '更新校驗檔案格式無效',
    },
  },
]

describe('update messages — four locales', () => {
  it.each(CASES)('$key resolves in every locale', ({ key, params, messages }) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(createServerTranslator(locale).format(key, params)).toBe(messages[locale])
    }
  })

  it.each(CASES)('$key keeps an English fallback with no Han characters', ({ key, params }) => {
    expect(descriptorFor(key, params).fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })
})
