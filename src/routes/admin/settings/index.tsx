import { Children, useCallback, useEffect, useSyncExternalStore } from 'react'
import { useNavigate, useOutletContext } from 'react-router'

import type { SettingsOutletContext } from '@/routes/admin/settings/layout'
import type { SecretMasks } from '@/server/domains/settings/services/core'

import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { settingsMeta } from '@/server/render/seo/settings-meta'
import { NAV_GROUP_LABEL, SECTION_DISPLAY } from '@/shared/config/display'
import { projectAssetsForAdmin, projectSearchForAdmin } from '@/shared/config/projection'
import { AnalyticsForm } from '@/ui/admin/settings/AnalyticsForm'
import { AssetsForm } from '@/ui/admin/settings/AssetsForm'
import { BackupView } from '@/ui/admin/settings/BackupView'
import { CacheView } from '@/ui/admin/settings/CacheView'
import { CommentsForm } from '@/ui/admin/settings/CommentsForm'
import { ContentForm } from '@/ui/admin/settings/ContentForm'
import { FontsForm } from '@/ui/admin/settings/FontsForm'
import { GeneralForm } from '@/ui/admin/settings/GeneralForm'
import { LimitsForm } from '@/ui/admin/settings/LimitsForm'
import { MailForm } from '@/ui/admin/settings/MailForm'
import { NavigationEditor } from '@/ui/admin/settings/NavigationEditor'
import { SearchForm } from '@/ui/admin/settings/SearchForm'
import { SecurityForm } from '@/ui/admin/settings/SecurityForm'
import { SeoForm } from '@/ui/admin/settings/SeoForm'
import { SettingsCloseButton } from '@/ui/admin/settings/shell/SettingsHeader'
import { SettingsMobileBar } from '@/ui/admin/settings/shell/SettingsMobileBar'
import { ICON_MAP, SettingsNav } from '@/ui/admin/settings/shell/SettingsNav'
import { SettingsPanel } from '@/ui/admin/settings/shell/SettingsPanel'
import { SettingsSearchInput } from '@/ui/admin/settings/shell/SettingsSearchInput'
import { ScrollSpyProvider, useScrollSpy } from '@/ui/admin/settings/shell/useSettingsScrollSpy'
import { SettingsSearchProvider, useSettingsSearchContext } from '@/ui/admin/settings/shell/useSettingsSearch'
import { SidebarForm } from '@/ui/admin/settings/SidebarForm'
import { SocialsEditor } from '@/ui/admin/settings/SocialsEditor'
import { ThresholdForm } from '@/ui/admin/settings/ThresholdForm'

import type { Route } from './+types/index'

export const meta = settingsMeta('系统设置')

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getRouteRequestContext({ request, context })
  requireRole(ctx, 'admin')
  return null
}

const SECTION_CONFIGS: {
  id: keyof typeof SECTION_DISPLAY
  render: (bundle: SettingsOutletContext['bundle'], tz: readonly string[], masks: SecretMasks) => React.ReactNode
}[] = [
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
    render: (bundle) => <CommentsForm comments={bundle.comments} />,
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
        mail={{
          mail: {
            enabled: bundle.mail.mail.enabled,
            host: bundle.mail.mail.host,
            sender: bundle.mail.mail.sender,
            apiKeyMask: masks.mailApiKeyMask,
            transport: bundle.mail.mail.transport,
            smtpHost: bundle.mail.mail.smtpHost,
            smtpPort: bundle.mail.mail.smtpPort,
            smtpUser: bundle.mail.mail.smtpUser,
            smtpPassMask: masks.mailSmtpPassMask,
            smtpSecure: bundle.mail.mail.smtpSecure,
          },
        }}
      />
    ),
  },
  {
    id: 'search',
    render: (bundle, _tz, masks) => (
      <SearchForm search={projectSearchForAdmin(bundle.search, masks.searchApiKeyMask)} />
    ),
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
    id: 'security',
    render: (bundle) => <SecurityForm security={bundle.security} mail={bundle.mail.mail} />,
  },
  {
    id: 'backup',
    render: (bundle) => (
      <BackupView
        backup={
          bundle.backup ?? {
            scheduled: { enabled: false, frequency: 'daily', hour: 3, minute: 0 },
            retention: { enabled: true, days: 30 },
          }
        }
        timeZone={bundle.siteIdentity.timeZone}
      />
    ),
  },
]

const MOBILE_QUERY = '(max-width: 1023px)'

function subscribeMobile(callback: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getMobileSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches
}

function getMobileServerSnapshot() {
  return false
}

function useIsMobile() {
  return useSyncExternalStore(subscribeMobile, getMobileSnapshot, getMobileServerSnapshot)
}

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
  const Icon = ICON_MAP[icon]
  return (
    <div ref={ref}>
      <h3 className="flex items-center gap-2 font-semibold text-foreground">
        {Icon && <Icon className="size-4" />}
        {title}
      </h3>
      <div className="mt-4 flex flex-col gap-5">{children}</div>
    </div>
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

function SettingsPageInner() {
  const navigate = useNavigate()
  const { bundle, timeZones, masks } = useOutletContext<SettingsOutletContext>()
  const settings = bundle
  const tz = timeZones
  const { checkVisible, filter } = useSettingsSearchContext()
  const isMobile = useIsMobile()

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

      void navigate(-1)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [navigate])

  const navItems = SECTION_CONFIGS.map((s) => ({
    id: s.id,
    label: SECTION_DISPLAY[s.id].label,
    icon: SECTION_DISPLAY[s.id].icon,
    group: SECTION_DISPLAY[s.id].group,
    keywords: [SECTION_DISPLAY[s.id].label, SECTION_DISPLAY[s.id].description, s.id],
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
        SECTION_DISPLAY[s.id as keyof typeof SECTION_DISPLAY].label,
        SECTION_DISPLAY[s.id as keyof typeof SECTION_DISPLAY].description,
        s.id,
      ])
    },
    [isMobile, filter, checkVisible],
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
              <SettingsGroup key={group} title={NAV_GROUP_LABEL[group]}>
                {SECTION_CONFIGS.filter((s) => SECTION_DISPLAY[s.id].group === group).map((s) =>
                  isSectionVisible(s.id) ? (
                    <SectionWrapper
                      key={s.id}
                      id={s.id}
                      title={SECTION_DISPLAY[s.id].label}
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

export default function SettingsPage() {
  return (
    <ScrollSpyProvider>
      <SettingsSearchProvider>
        <SettingsPageInner />
      </SettingsSearchProvider>
    </ScrollSpyProvider>
  )
}
