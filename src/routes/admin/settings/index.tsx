import { Children, useCallback, useEffect, useSyncExternalStore } from 'react'
import { useNavigate, useOutletContext } from 'react-router'

import type { SettingsOutletContext } from '@/routes/admin/settings/layout'

import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { settingsMeta } from '@/server/render/seo/settings-meta'
import { SECTION_DISPLAY, projectAssetsForAdmin, projectSearchForAdmin } from '@/shared/config/settings'
import { AssetsForm } from '@/ui/admin/settings/AssetsForm'
import { BackupView } from '@/ui/admin/settings/BackupView'
import { CacheView } from '@/ui/admin/settings/CacheView'
import { CommentsForm } from '@/ui/admin/settings/CommentsForm'
import { ContentForm } from '@/ui/admin/settings/ContentForm'
import { CorsForm } from '@/ui/admin/settings/CorsForm'
import { FontsForm } from '@/ui/admin/settings/FontsForm'
import { GeneralForm } from '@/ui/admin/settings/GeneralForm'
import { LimitsForm } from '@/ui/admin/settings/LimitsForm'
import { MailForm } from '@/ui/admin/settings/MailForm'
import { NavigationEditor } from '@/ui/admin/settings/NavigationEditor'
import { SearchForm } from '@/ui/admin/settings/SearchForm'
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

const SECTIONS = [
  // 站点
  { id: 'general', ...SECTION_DISPLAY.general },
  { id: 'assets', ...SECTION_DISPLAY.assets },
  { id: 'fonts', ...SECTION_DISPLAY.fonts },
  // 内容与展示
  { id: 'content', ...SECTION_DISPLAY.content },
  { id: 'sidebar', ...SECTION_DISPLAY.sidebar },
  { id: 'comments', ...SECTION_DISPLAY.comments },
  { id: 'seo', ...SECTION_DISPLAY.seo },
  { id: 'navigation', ...SECTION_DISPLAY.navigation },
  { id: 'socials', ...SECTION_DISPLAY.socials },
  // 服务集成
  { id: 'mail', ...SECTION_DISPLAY.mail },
  { id: 'search', ...SECTION_DISPLAY.search },
  // 系统运维
  { id: 'cache', ...SECTION_DISPLAY.cache },
  { id: 'cors', ...SECTION_DISPLAY.cors },
  { id: 'rateLimit', ...SECTION_DISPLAY.rateLimit },
  { id: 'limits', ...SECTION_DISPLAY.limits },
  { id: 'backup', ...SECTION_DISPLAY.backup },
] as const

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
  const { bundle, timeZones } = useOutletContext<SettingsOutletContext>()
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

  const navItems = SECTIONS.map((s) => ({
    id: s.id,
    label: s.label,
    icon: s.icon,
    group: s.group,
    keywords: [s.label, s.description, s.id],
  }))

  const isSectionVisible = useCallback(
    (id: string) => {
      if (!isMobile || !filter) {
        return true
      }
      const s = SECTIONS.find((sec) => sec.id === id)
      if (!s) {
        return true
      }
      return checkVisible([s.label, s.description, s.id])
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
        <div className="px-8 pt-16 pb-[60vh] lg:max-w-[760px] lg:px-14 lg:pt-0">
          <div className="flex flex-col gap-16">
            <SettingsGroup title="站点">
              {isSectionVisible('general') && (
                <SectionWrapper id="general" title="基本信息" icon="Settings">
                  <GeneralForm siteIdentity={settings.siteIdentity} timeZones={tz} />
                </SectionWrapper>
              )}
              {isSectionVisible('assets') && (
                <SectionWrapper id="assets" title="存储配置" icon="HardDrive">
                  <AssetsForm assets={projectAssetsForAdmin(settings.assets)} />
                </SectionWrapper>
              )}
              {isSectionVisible('fonts') && (
                <SectionWrapper id="fonts" title="字体配置" icon="Type">
                  <FontsForm fonts={settings.fonts} />
                </SectionWrapper>
              )}
            </SettingsGroup>

            <SettingsGroup title="内容与展示">
              {isSectionVisible('content') && (
                <SectionWrapper id="content" title="内容与分页" icon="FileText">
                  <ContentForm content={settings.content} />
                </SectionWrapper>
              )}
              {isSectionVisible('sidebar') && (
                <SectionWrapper id="sidebar" title="侧边栏" icon="PanelLeft">
                  <SidebarForm sidebar={settings.sidebar} />
                </SectionWrapper>
              )}
              {isSectionVisible('comments') && (
                <SectionWrapper id="comments" title="评论与头像" icon="MessageSquare">
                  <CommentsForm comments={settings.comments} />
                </SectionWrapper>
              )}
              {isSectionVisible('seo') && (
                <SectionWrapper id="seo" title="SEO 与目录" icon="Search">
                  <SeoForm seo={settings.seo} />
                </SectionWrapper>
              )}
              {isSectionVisible('navigation') && (
                <SectionWrapper id="navigation" title="导航菜单" icon="Navigation">
                  <NavigationEditor navigation={settings.navigation} socials={settings.socials.socials} />
                </SectionWrapper>
              )}
              {isSectionVisible('socials') && (
                <SectionWrapper id="socials" title="社交链接" icon="Share2">
                  <SocialsEditor socials={settings.socials} />
                </SectionWrapper>
              )}
            </SettingsGroup>

            <SettingsGroup title="服务集成">
              {isSectionVisible('mail') && (
                <SectionWrapper id="mail" title="邮件服务" icon="Mail">
                  <MailForm
                    mail={{
                      enabled: settings.mail.mail.enabled,
                      host: settings.mail.mail.host,
                      sender: settings.mail.mail.sender,
                      apiKeyMask: settings.mail.mail.apiKey === '' ? null : settings.mail.mail.apiKey.slice(-4),
                    }}
                  />
                </SectionWrapper>
              )}
              {isSectionVisible('search') && (
                <SectionWrapper id="search" title="文章搜索" icon="SearchCode">
                  <SearchForm search={projectSearchForAdmin(settings.search)} />
                </SectionWrapper>
              )}
            </SettingsGroup>

            <SettingsGroup title="系统运维">
              {isSectionVisible('cache') && (
                <SectionWrapper id="cache" title="缓存管理" icon="Database">
                  <CacheView cache={settings.cache.cache} />
                </SectionWrapper>
              )}
              {isSectionVisible('cors') && (
                <SectionWrapper id="cors" title="CORS 配置" icon="Globe">
                  <CorsForm cors={settings.cors} />
                </SectionWrapper>
              )}
              {isSectionVisible('rateLimit') && (
                <SectionWrapper id="rateLimit" title="流控设置" icon="Shield">
                  <ThresholdForm rateLimit={settings.rateLimit} />
                </SectionWrapper>
              )}
              {isSectionVisible('limits') && (
                <SectionWrapper id="limits" title="运行限制" icon="SlidersHorizontal">
                  <LimitsForm limits={settings.limits} />
                </SectionWrapper>
              )}
              {isSectionVisible('backup') && (
                <SectionWrapper id="backup" title="备份与还原" icon="Archive">
                  <BackupView
                    backup={
                      settings.backup ?? {
                        scheduled: { enabled: false, frequency: 'daily', hour: 3, minute: 0 },
                        retention: { enabled: true, days: 30 },
                      }
                    }
                    timeZone={settings.siteIdentity.timeZone}
                  />
                </SectionWrapper>
              )}
            </SettingsGroup>
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
