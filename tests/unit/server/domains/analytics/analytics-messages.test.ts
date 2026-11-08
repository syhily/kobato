import { describe, expect, it } from 'vitest'

import type { ErrorMessageParams } from '@/shared/contracts/api-error'
import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// GeoIP remote-update failures across all four locales (scheduler semantics and
// provider diagnostics stay untouched).
interface Case {
  key: UiMessageId
  params?: ErrorMessageParams
  messages: Record<AppLocale, string>
}

const CASES: Case[] = [
  {
    key: 'analytics.error.geoipDownloadConnect',
    messages: {
      'en-US': 'Could not connect to the GeoIP download source; check the network and try again.',
      'zh-CN': '无法连接 GeoIP 下载源，请检查网络后重试',
      'zh-TW': '無法連線 GeoIP 下載來源，請檢查網路後重試',
      'zh-HK': '無法連線 GeoIP 下載來源，請檢查網路後重試',
    },
  },
  {
    key: 'analytics.error.geoipDownloadStatus',
    params: { status: 404 },
    messages: {
      'en-US': 'Downloading the GeoIP database failed (HTTP 404)',
      'zh-CN': '下载 GeoIP 数据库失败（HTTP 404）',
      'zh-TW': '下載 GeoIP 資料庫失敗（HTTP 404）',
      'zh-HK': '下載 GeoIP 資料庫失敗（HTTP 404）',
    },
  },
  {
    key: 'analytics.error.geoipDownloadTimeout',
    messages: {
      'en-US': 'The GeoIP database download timed out. Please try again later.',
      'zh-CN': 'GeoIP 数据库下载超时，请稍后再试',
      'zh-TW': 'GeoIP 資料庫下載逾時，請稍後再試',
      'zh-HK': 'GeoIP 資料庫下載逾時，請稍後再試',
    },
  },
  {
    key: 'analytics.error.geoipInvalid',
    messages: {
      'en-US': 'The downloaded GeoIP database is invalid; the update was aborted',
      'zh-CN': '下载的 GeoIP 数据库无效，已中止',
      'zh-TW': '下載的 GeoIP 資料庫無效，已中止',
      'zh-HK': '下載的 GeoIP 資料庫無效，已中止',
    },
  },
  {
    key: 'analytics.error.geoipTooLarge',
    params: { max: '100 MB' },
    messages: {
      'en-US': 'The GeoIP database exceeds the 100 MB size limit',
      'zh-CN': 'GeoIP 数据库超过 100 MB 大小限制',
      'zh-TW': 'GeoIP 資料庫超過 100 MB 大小限制',
      'zh-HK': 'GeoIP 資料庫超過 100 MB 大小限制',
    },
  },
  {
    key: 'analytics.error.geoipVersionConnect',
    messages: {
      'en-US': 'Could not connect to the GeoIP update source; check the network and try again.',
      'zh-CN': '无法连接 GeoIP 更新源，请检查网络后重试',
      'zh-TW': '無法連線 GeoIP 更新來源，請檢查網路後重試',
      'zh-HK': '無法連線 GeoIP 更新來源，請檢查網路後重試',
    },
  },
  {
    key: 'analytics.error.geoipVersionInvalid',
    messages: {
      'en-US': 'The GeoIP update source returned invalid version information',
      'zh-CN': 'GeoIP 更新源返回了无效的版本信息',
      'zh-TW': 'GeoIP 更新來源傳回了無效的版本資訊',
      'zh-HK': 'GeoIP 更新來源傳回了無效的版本資訊',
    },
  },
  {
    key: 'analytics.error.geoipVersionStatus',
    params: { status: 502 },
    messages: {
      'en-US': 'GeoIP version check failed (HTTP 502)',
      'zh-CN': 'GeoIP 版本检测失败（HTTP 502）',
      'zh-TW': 'GeoIP 版本檢查失敗（HTTP 502）',
      'zh-HK': 'GeoIP 版本檢查失敗（HTTP 502）',
    },
  },
  {
    key: 'analytics.error.geoipVersionTimeout',
    messages: {
      'en-US': 'The GeoIP version check timed out. Please try again later.',
      'zh-CN': 'GeoIP 版本检测超时，请稍后再试',
      'zh-TW': 'GeoIP 版本檢查逾時，請稍後再試',
      'zh-HK': 'GeoIP 版本檢查逾時，請稍後再試',
    },
  },
]

describe('analytics messages — four locales', () => {
  it.each(CASES)('$key resolves in every locale', ({ key, params, messages }) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(createServerTranslator(locale).format(key, params)).toBe(messages[locale])
    }
  })

  it.each(CASES)('$key keeps an English fallback with no Han characters', ({ key, params }) => {
    expect(descriptorFor(key, params).fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })
})
