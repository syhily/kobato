// Root-level cross-tab locale sync over `@/client/lib/locale-sync`'s BroadcastChannel (a
// settings-card subscription could only cover /admin/settings). The receiver never commits
// the locale (the sender persisted it) and never re-publishes, so there is no echo loop.
// Only a registered settings workspace reloads automatically, after every dirty card has
// flushed; any other document may hold unsaved input this app cannot inspect and is never
// reloaded behind the user's back — it gets a localized notice with an explicit Reload,
// and a failed flush keeps the edits and offers Retry.

import type { ReactNode } from 'react'

import { XIcon } from 'lucide-react'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { LocaleChangeAnnouncement } from '@/client/lib/locale-sync'
import type { AppLocale } from '@/shared/i18n/locales'

import { createLocaleSyncOrigin, publishLocaleChange, subscribeLocaleChange } from '@/client/lib/locale-sync'
import { getLogger } from '@/client/lib/logger'
import { useI18n } from '@/ui/lib/I18nProvider'

const log = getLogger('locale-sync')

/** What a mounted settings workspace gives the root sync loop. */
export interface LocaleSyncFlushHost {
  /** The settings workspace transaction host (`inert` + pending flag). */
  runTransaction: <T>(task: () => T | Promise<T>) => Promise<T>
  /** True only when EVERY dirty card committed. */
  flushAllAndWait: () => Promise<boolean>
  /** True while the workspace runs a transaction of its own. */
  isBusy: () => boolean
}

interface LocaleSyncContextValue {
  /** Announce a locale this document just committed. Called exactly once. */
  publish: (locale: AppLocale) => void
  /** Register the settings workspace flush host. Returns an unregister fn. */
  registerFlushHost: (host: LocaleSyncFlushHost) => () => void
}

/** Why the page has not reloaded yet. */
type LocaleSyncNoticeKind = 'reload-required' | 'flush-failed'

interface LocaleSyncNotice {
  kind: LocaleSyncNoticeKind
  locale: AppLocale
  revision?: string
}

// Fallback for card-level tests that render a settings card without the root
// provider: publishing still reaches peers, there is simply no listener here.
let fallbackOrigin: string | null = null
function publishWithoutProvider(locale: AppLocale): void {
  fallbackOrigin ??= createLocaleSyncOrigin()
  publishLocaleChange(locale, fallbackOrigin)
}

const LocaleSyncContext = createContext<LocaleSyncContextValue>({
  publish: publishWithoutProvider,
  registerFlushHost: () => () => {
    /* no workspace to register */
  },
})

export interface LocaleSyncProviderProps {
  /** The locale this document bootstrapped with. */
  locale: AppLocale
  /** The bootstrap settings revision (`<bootId>:<counter>`) — an opaque dedupe token. */
  revision?: string
  children: ReactNode
}

export function LocaleSyncProvider({ locale, revision, children }: LocaleSyncProviderProps) {
  const { t } = useI18n()
  // One id per mounted provider: the publisher and its own subscriber share it,
  // so this document ignores its own echo.
  const [origin] = useState(createLocaleSyncOrigin)
  const hostRef = useRef<LocaleSyncFlushHost | null>(null)
  const loadedLocaleRef = useRef(locale)
  const revisionRef = useRef(revision)
  // Consumed immediately before a reload is attempted — never on failure.
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
          // No flush host: this document may hold editor/comment/setup input that cannot
          // be safely persisted or inspected. Never reload it behind the user's back —
          // offer the explicit action instead.
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
      // Already showing it (this document is the sender, or a peer announced a
      // locale the page loaded after a reload).
      if (announcement.locale === loadedLocaleRef.current) {
        return
      }
      // A generation whose reload was already attempted (the browser is on its
      // way out; a repeat must not stack another reload).
      if (announcement.revision !== undefined && announcement.revision === reloadedRevisionRef.current) {
        return
      }
      if (inFlightRef.current) {
        return
      }
      // One open notice per announcement: a third tab repeating it must not
      // re-render a second alert (or restart a retry the user is reading).
      const current = noticeRef.current
      if (current !== null && current.locale === announcement.locale && current.revision === announcement.revision) {
        return
      }
      const host = hostRef.current
      // A local settings switch (or this tab's own previous sync) owns the
      // reload; reloading now would drop its in-flight saves.
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

/** Announce a committed locale to peer documents. */
export function useLocaleSyncPublish(): (locale: AppLocale) => void {
  return use(LocaleSyncContext).publish
}

/** Register the settings workspace flush host with the root sync loop. */
export function useLocaleSyncHostRegistration(): (host: LocaleSyncFlushHost) => () => void {
  return use(LocaleSyncContext).registerFlushHost
}
