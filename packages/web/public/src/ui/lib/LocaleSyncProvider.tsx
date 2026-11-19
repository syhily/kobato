import type { AppLocale } from '@kobato/i18n/locales.ts'
import type { LocaleChangeAnnouncement } from '@kobato/web-client/lib/locale-sync.ts'
import type { ReactNode } from 'react'

import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { getLogger } from '@kobato/ui/lib/logger.ts'
import {
  createLocaleSyncOrigin,
  publishLocaleChange,
  subscribeLocaleChange,
} from '@kobato/web-client/lib/locale-sync.ts'
import { XIcon } from 'lucide-react'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'

const log = getLogger('locale-sync')

export interface LocaleSyncFlushHost {
  /** The settings workspace transaction host (`inert` + pending flag). */
  runTransaction: <T>(task: () => T | Promise<T>) => Promise<T>
  /** True only when EVERY dirty card committed. */
  flushAllAndWait: () => Promise<boolean>
  /** True while the workspace runs a transaction of its own. */
  isBusy: () => boolean
}

interface LocaleSyncContextValue {
  publish: (locale: AppLocale) => void
  registerFlushHost: (host: LocaleSyncFlushHost) => () => void
}

type LocaleSyncNoticeKind = 'reload-required' | 'flush-failed'

interface LocaleSyncNotice {
  kind: LocaleSyncNoticeKind
  locale: AppLocale
  revision?: string
}

let fallbackOrigin: string | null = null
function publishWithoutProvider(locale: AppLocale): void {
  fallbackOrigin ??= createLocaleSyncOrigin()
  publishLocaleChange(locale, fallbackOrigin)
}

const LocaleSyncContext = createContext<LocaleSyncContextValue>({
  publish: publishWithoutProvider,
  registerFlushHost: () => () => undefined,
})

export interface LocaleSyncProviderProps {
  locale: AppLocale
  /** The bootstrap settings revision (`<bootId>:<counter>`) — an opaque dedupe token. */
  revision?: string
  children: ReactNode
}

export function LocaleSyncProvider({ locale, revision, children }: LocaleSyncProviderProps) {
  const { t } = useI18n()
  const [origin] = useState(createLocaleSyncOrigin)
  const hostRef = useRef<LocaleSyncFlushHost | null>(null)
  const loadedLocaleRef = useRef(locale)
  const revisionRef = useRef(revision)
  const reloadedRevisionRef = useRef<string | undefined>(undefined)
  const inFlightRef = useRef(false)
  const noticeRef = useRef<LocaleSyncNotice | null>(null)
  const [notice, setNotice] = useState<LocaleSyncNotice | null>(null)

  useEffect(() => {
    loadedLocaleRef.current = locale
    revisionRef.current = revision
  }, [locale, revision])

  const publish = useCallback((next: AppLocale) => publishLocaleChange(next, origin, revisionRef.current), [origin])

  const registerFlushHost = useCallback((host: LocaleSyncFlushHost) => {
    hostRef.current = host
    return () => {
      if (hostRef.current === host) {
        hostRef.current = null
      }
    }
  }, [])

  const showNotice = useCallback((next: LocaleSyncNotice) => {
    noticeRef.current = next
    setNotice(next)
  }, [])

  const dismissNotice = useCallback(() => {
    noticeRef.current = null
    setNotice(null)
  }, [])

  const reloadFor = useCallback((announcement: LocaleChangeAnnouncement) => {
    if (announcement.revision !== undefined) {
      reloadedRevisionRef.current = announcement.revision
    }
    noticeRef.current = null
    setNotice(null)
    window.location.reload()
  }, [])

  const runSync = useCallback(
    async (announcement: LocaleChangeAnnouncement): Promise<void> => {
      if (inFlightRef.current) {
        return
      }
      inFlightRef.current = true
      try {
        const host = hostRef.current
        if (host === null) {
          showNotice({ kind: 'reload-required', ...announcement })
          return
        }
        const flushed = await host.runTransaction(() => host.flushAllAndWait())
        if (!flushed) {
          showNotice({ kind: 'flush-failed', ...announcement })
          return
        }
        reloadFor(announcement)
      } catch (error) {
        log.warn('cross-tab locale sync failed', { error })
        showNotice({ kind: 'flush-failed', ...announcement })
      } finally {
        inFlightRef.current = false
      }
    },
    [reloadFor, showNotice],
  )

  useEffect(() => {
    return subscribeLocaleChange(origin, (announcement) => {
      if (announcement.locale === loadedLocaleRef.current) {
        return
      }
      if (announcement.revision !== undefined && announcement.revision === reloadedRevisionRef.current) {
        return
      }
      if (inFlightRef.current) {
        return
      }
      const current = noticeRef.current
      if (current !== null && current.locale === announcement.locale && current.revision === announcement.revision) {
        return
      }
      const host = hostRef.current
      if (host?.isBusy()) {
        return
      }
      void runSync(announcement)
    })
  }, [origin, runSync])

  const value = useMemo(() => ({ publish, registerFlushHost }), [publish, registerFlushHost])

  const retry = () => {
    const current = noticeRef.current
    if (current === null) {
      return
    }
    dismissNotice()
    void runSync(current)
  }

  const reloadNow = () => {
    const current = noticeRef.current
    if (current === null) {
      return
    }
    reloadFor(current)
  }

  return (
    <LocaleSyncContext value={value}>
      {children}
      {notice !== null ? (
        <div
          role="alert"
          className="fixed inset-x-3 bottom-4 z-50 mx-auto flex max-w-lg items-start gap-3 rounded-md border border-status-error-border bg-status-error-bg px-4 py-3 text-status-error-fg shadow-card"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t('common.localeSync.title')}</p>
            <p className="mt-1 text-sm">
              {t(notice.kind === 'flush-failed' ? 'common.localeSync.flushFailed' : 'common.localeSync.reloadRequired')}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {notice.kind === 'flush-failed' ? (
                <button
                  type="button"
                  className="rounded-md border border-status-error-border px-3 py-1.5 text-sm font-medium hover:bg-current/10"
                  onClick={retry}
                >
                  {t('common.action.retry')}
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-md border border-status-error-border px-3 py-1.5 text-sm font-medium hover:bg-current/10"
                onClick={reloadNow}
              >
                {t('common.action.reload')}
              </button>
            </div>
          </div>
          <button
            type="button"
            aria-label={t('common.action.close')}
            className="shrink-0 rounded-sm p-1 hover:bg-current/10"
            onClick={dismissNotice}
          >
            <XIcon aria-hidden className="size-4" />
          </button>
        </div>
      ) : null}
    </LocaleSyncContext>
  )
}

export function useLocaleSyncPublish(): (locale: AppLocale) => void {
  return use(LocaleSyncContext).publish
}

export function useLocaleSyncHostRegistration(): (host: LocaleSyncFlushHost) => () => void {
  return use(LocaleSyncContext).registerFlushHost
}
