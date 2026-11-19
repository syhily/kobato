import type { SettingsSection } from '@kobato/settings/sections.ts'
import type { SecretMasks, SettingsBundle } from '@kobato/settings/types.ts'
import type { Assert, Equals } from '@kobato/utils/type-equals.ts'

import {
  projectAssetsForAdmin,
  projectBackupForAdmin,
  projectCommentsForAdmin,
  projectMailForAdmin,
} from '@kobato/settings/projection.ts'
import { SETTINGS_SECTIONS } from '@kobato/settings/sections.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { useMediaQuery } from '@kobato/ui/lib/use-media-query.ts'
import { AnalyticsForm } from '@kobato/web-admin/ui/settings/AnalyticsForm.tsx'
import { AssetsForm } from '@kobato/web-admin/ui/settings/AssetsForm.tsx'
import { BackupView } from '@kobato/web-admin/ui/settings/backup/BackupView.tsx'
import { CacheView } from '@kobato/web-admin/ui/settings/cache/CacheView.tsx'
import { CommentsForm } from '@kobato/web-admin/ui/settings/comments/CommentsForm.tsx'
import { ContentForm } from '@kobato/web-admin/ui/settings/content/ContentForm.tsx'
import { NAV_GROUP_LABEL_KEYS, SECTION_DISPLAY } from '@kobato/web-admin/ui/settings/display.ts'
import { FontsForm } from '@kobato/web-admin/ui/settings/FontsForm.tsx'
import { GeneralForm } from '@kobato/web-admin/ui/settings/general/GeneralForm.tsx'
import { LimitsForm } from '@kobato/web-admin/ui/settings/LimitsForm.tsx'
import { MailForm } from '@kobato/web-admin/ui/settings/mail/MailForm.tsx'
import { NavigationEditor } from '@kobato/web-admin/ui/settings/navigation/NavigationEditor.tsx'
import { NewsletterForm } from '@kobato/web-admin/ui/settings/NewsletterForm.tsx'
import { ObservabilityForm } from '@kobato/web-admin/ui/settings/observability/ObservabilityForm.tsx'
import { ThresholdForm } from '@kobato/web-admin/ui/settings/rate-limit/ThresholdForm.tsx'
import { SecurityForm } from '@kobato/web-admin/ui/settings/security/SecurityForm.tsx'
import { SeoForm } from '@kobato/web-admin/ui/settings/SeoForm.tsx'
import {
  SettingsFlushProvider,
  useSettingsFlushContext,
} from '@kobato/web-admin/ui/settings/shell/SettingsFlushProvider.tsx'
import { SettingsCloseButton } from '@kobato/web-admin/ui/settings/shell/SettingsHeader.tsx'
import { SettingsMobileBar } from '@kobato/web-admin/ui/settings/shell/SettingsMobileBar.tsx'
import { ICON_MAP, SettingsNav } from '@kobato/web-admin/ui/settings/shell/SettingsNav.tsx'
import { SettingsPanel } from '@kobato/web-admin/ui/settings/shell/SettingsPanel.tsx'
import { SettingsSearchInput } from '@kobato/web-admin/ui/settings/shell/SettingsSearchInput.tsx'
import { ScrollSpyProvider, useScrollSpy } from '@kobato/web-admin/ui/settings/shell/use-settings-scroll-spy.tsx'
import {
  SettingsSearchProvider,
  useSettingsSearchContext,
} from '@kobato/web-admin/ui/settings/shell/use-settings-search.tsx'
import { SidebarForm } from '@kobato/web-admin/ui/settings/sidebar/SidebarForm.tsx'
import { SocialsEditor } from '@kobato/web-admin/ui/settings/SocialsEditor.tsx'
import { WebmentionsForm } from '@kobato/web-admin/ui/settings/WebmentionsForm.tsx'
import { Children, Fragment, useCallback, useEffect, useRef } from 'react'

interface SectionConfig {
  id: SettingsSection
  render: (bundle: SettingsBundle, tz: readonly string[], masks: SecretMasks) => React.ReactNode
}

const SECTION_CONFIGS = [
  {
    id: 'general',
    render: (bundle, tz) => <GeneralForm siteIdentity={bundle.siteIdentity} timeZones={tz} />,
  },
  {
    id: 'assets',
    render: (bundle, _tz, masks) => (
      <AssetsForm assets={projectAssetsForAdmin(bundle.assets, masks.assetsSecretAccessKeyMask)} />
    ),
  },
  {
    id: 'fonts',
    render: (bundle) => <FontsForm fonts={bundle.fonts} />,
  },
  {
    id: 'content',
    render: (bundle) => <ContentForm content={bundle.content} />,
  },
  {
    id: 'sidebar',
    render: (bundle) => <SidebarForm sidebar={bundle.sidebar} />,
  },
  {
    id: 'comments',
    render: (bundle, _tz, masks) => (
      <CommentsForm comments={projectCommentsForAdmin(bundle.comments, masks.commentsGithubTokenMask)} />
    ),
  },
  {
    id: 'webmentions',
    render: (bundle) => <WebmentionsForm webmentions={bundle.webmentions} />,
  },
  {
    id: 'seo',
    render: (bundle) => <SeoForm seo={bundle.seo} />,
  },
  {
    id: 'navigation',
    render: (bundle) => <NavigationEditor navigation={bundle.navigation} socials={bundle.socials.socials} />,
  },
  {
    id: 'socials',
    render: (bundle) => <SocialsEditor socials={bundle.socials} />,
  },
  {
    id: 'mail',
    render: (bundle, _tz, masks) => (
      <MailForm
        mail={projectMailForAdmin(bundle.mail, {
          smtpPassMask: masks.mailSmtpPassMask,
          mailgunApiKeyMask: masks.mailMailgunApiKeyMask,
        })}
      />
    ),
  },
  {
    id: 'newsletter',
    render: (bundle) => <NewsletterForm newsletter={bundle.newsletter} />,
  },
  {
    id: 'cache',
    render: (bundle) => <CacheView cache={bundle.cache.cache} />,
  },
  {
    id: 'rateLimit',
    render: (bundle) => <ThresholdForm rateLimit={bundle.rateLimit} />,
  },
  {
    id: 'limits',
    render: (bundle) => <LimitsForm limits={bundle.limits} />,
  },
  {
    id: 'analytics',
    render: (bundle) => <AnalyticsForm analytics={bundle.analytics} />,
  },
  {
    id: 'observability',
    render: (bundle, _tz, masks) => (
      <ObservabilityForm
        observability={bundle.observability}
        passwordMask={masks.observabilityPasswordMask}
        rumClientTokenMask={masks.observabilityRumClientTokenMask}
      />
    ),
  },
  {
    id: 'security',
    render: (bundle) => <SecurityForm security={bundle.security} />,
  },
  {
    id: 'backup',
    render: (bundle, _tz, masks) => (
      <BackupView
        backup={projectBackupForAdmin(bundle.backup, masks.backupEncryptionPasswordMask)}
        timeZone={bundle.siteIdentity.timeZone}
      />
    ),
  },
] as const satisfies readonly SectionConfig[]

type _sectionConfigsCoverAllSections = Assert<Equals<(typeof SECTION_CONFIGS)[number]['id'], SettingsSection>>
type _sectionConfigsHaveNoDuplicates = Assert<
  Equals<(typeof SECTION_CONFIGS)['length'], (typeof SETTINGS_SECTIONS)['length']>
>

const MOBILE_QUERY = '(max-width: 1023px)'

function SectionWrapper({
  id,
  title,
  icon,
  children,
}: {
  id: string
  title: string
  icon: string
  children: React.ReactNode
}) {
  const { ref } = useScrollSpy(id)
  const { flushSection } = useSettingsFlushContext()
  // Only flush a "left the viewport" event after the section has ever been visible; the initial mount starts
  // off-screen below the fold.
  const hasBeenVisibleRef = useRef(false)
  const Icon = ICON_MAP[icon]

  useEffect(() => {
    const fragment = ref.current
    if (!fragment) {
      return
    }
    // Root is the content scroller: the panel is a fixed inset-0 container with its own scroll context.
    const root = document.getElementById('settings-content-scroller')
    // observeUsing reports per first-level child: the section counts as visible while any child intersects.
    const intersecting = new Set<Element>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            intersecting.add(entry.target)
          } else {
            intersecting.delete(entry.target)
          }
        }
        if (intersecting.size > 0) {
          hasBeenVisibleRef.current = true
        } else if (hasBeenVisibleRef.current) {
          flushSection(id)
        }
      },
      { root, threshold: 0 },
    )
    fragment.observeUsing(observer)
    return () => observer.disconnect()
  }, [id, flushSection, ref])

  return (
    <Fragment ref={ref}>
      <h3 className="flex items-center gap-2 font-semibold text-foreground">
        {Icon && <Icon className="size-4" />}
        {title}
      </h3>
      <div className="flex flex-col gap-5">{children}</div>
    </Fragment>
  )
}

interface SettingsGroupProps {
  title: string
  children: React.ReactNode
}

function SettingsGroup({ title, children }: SettingsGroupProps) {
  const visibleCount = Children.toArray(children).filter(Boolean).length
  if (!visibleCount) {
    return null
  }

  return (
    <div>
      <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
      <div className="mt-10 flex flex-col gap-6">{children}</div>
    </div>
  )
}

interface SettingsWorkspaceProps {
  bundle: SettingsBundle
  timeZones: readonly string[]
  masks: SecretMasks
  onClose: () => void
}

function SettingsPageInner({ bundle, timeZones, masks, onClose }: SettingsWorkspaceProps) {
  const { t } = useI18n()
  const settings = bundle
  const tz = timeZones
  const { checkVisible, filter } = useSettingsSearchContext()
  const { flushAll } = useSettingsFlushContext()
  const isMobile = useMediaQuery(MOBILE_QUERY)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      const openModal = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], #modal-backdrop',
      )
      if (openModal) {
        return
      }

      const active = document.activeElement
      if (
        active instanceof HTMLElement &&
        (active.nodeName === 'INPUT' || active.nodeName === 'TEXTAREA' || active.isContentEditable)
      ) {
        return
      }

      flushAll()
      onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, flushAll])

  // Flush pending edits when the page is hidden or unloaded. `pagehide` covers close-tab / back-nav where
  // visibilitychange doesn't fire; `beforeunload` is deliberately unused (it would pop a "leave site?" dialog).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushAll()
      }
    }
    const onPageHide = () => flushAll()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [flushAll])

  const navItems = SECTION_CONFIGS.map((s) => ({
    id: s.id,
    label: t(SECTION_DISPLAY[s.id].labelId),
    icon: SECTION_DISPLAY[s.id].icon,
    group: SECTION_DISPLAY[s.id].group,
    keywords: [t(SECTION_DISPLAY[s.id].labelId), t(SECTION_DISPLAY[s.id].descriptionId), s.id],
  }))

  const isSectionVisible = useCallback(
    (id: string) => {
      if (!isMobile || !filter) {
        return true
      }
      const s = SECTION_CONFIGS.find((sec) => sec.id === id)
      if (!s) {
        return true
      }
      return checkVisible([
        t(SECTION_DISPLAY[s.id as keyof typeof SECTION_DISPLAY].labelId),
        t(SECTION_DISPLAY[s.id as keyof typeof SECTION_DISPLAY].descriptionId),
        s.id,
      ])
    },
    [isMobile, filter, checkVisible, t],
  )

  return (
    <SettingsPanel>
      <SettingsCloseButton />
      <SettingsMobileBar />

      <aside className="hidden flex-1 basis-[320px] flex-col bg-muted/30 lg:flex">
        <div id="settings-nav-scroller" className="relative flex-1 overflow-y-auto p-8 lg:py-0">
          <div className="ml-auto flex w-full flex-col lg:max-w-[240px]">
            <SettingsSearchInput />
            <div className="pb-6">
              <SettingsNav items={navItems} />
            </div>
          </div>
        </div>
      </aside>

      <main
        id="settings-content-scroller"
        className="relative h-full flex-1 overflow-y-auto bg-background pt-12 lg:basis-[800px]"
      >
        <div className="px-8 pt-16 pb-editor-pad-bottom lg:max-w-[760px] lg:px-14 lg:pt-0">
          <div className="flex flex-col gap-16">
            {(['site', 'content', 'service', 'system'] as const).map((group) => (
              <SettingsGroup key={group} title={t(NAV_GROUP_LABEL_KEYS[group])}>
                {SECTION_CONFIGS.filter((s) => SECTION_DISPLAY[s.id].group === group).map((s) =>
                  isSectionVisible(s.id) ? (
                    <SectionWrapper
                      key={s.id}
                      id={s.id}
                      title={t(SECTION_DISPLAY[s.id].labelId)}
                      icon={SECTION_DISPLAY[s.id].icon}
                    >
                      {s.render(settings, tz, masks)}
                    </SectionWrapper>
                  ) : null,
                )}
              </SettingsGroup>
            ))}
          </div>
        </div>
      </main>
    </SettingsPanel>
  )
}

/**
 * The whole settings workspace: section registry + shell chrome + flush/scroll-spy/search providers.
 * Route modules only resolve the data and a close callback, then render this.
 */
export function SettingsWorkspace({ bundle, timeZones, masks, onClose }: SettingsWorkspaceProps) {
  return (
    <SettingsFlushProvider>
      <ScrollSpyProvider>
        <SettingsSearchProvider>
          <SettingsPageInner bundle={bundle} timeZones={timeZones} masks={masks} onClose={onClose} />
        </SettingsSearchProvider>
      </ScrollSpyProvider>
    </SettingsFlushProvider>
  )
}
