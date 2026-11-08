import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { WebmentionInboxView } from '@/ui/admin/webmentions/WebmentionInboxView'
import { WebmentionOutboxView } from '@/ui/admin/webmentions/WebmentionOutboxView'
import { Tabs, TabsList, TabsTrigger } from '@/ui/components/tabs'
import { useI18n } from '@/ui/lib/I18nProvider'

export type WebmentionTab = 'inbox' | 'outbox'

function isWebmentionTab(value: unknown): value is WebmentionTab {
  return value === 'inbox' || value === 'outbox'
}

// One page, both directions: 「接收审核」(moderation queue) and 「发送日志」
// (read-only outbound log). Pure-props: the route owns the tab state and
// mirrors it into `?tab=` so a switched tab survives reload/share.
export function WebmentionsView({
  tab,
  onTabChange,
}: {
  tab: WebmentionTab
  onTabChange: (tab: WebmentionTab) => void
}) {
  const { t } = useI18n()
  return (
    <AdminListPage>
      <AdminListPage.Header title={t('admin.webmentions.title')} description={t('admin.webmentions.description')} />

      <Tabs
        value={tab}
        onValueChange={(value: unknown) => {
          if (isWebmentionTab(value)) {
            onTabChange(value)
          }
        }}
      >
        <TabsList>
          <TabsTrigger value="inbox">{t('admin.webmentions.tab.inbox')}</TabsTrigger>
          <TabsTrigger value="outbox">{t('admin.webmentions.tab.outbox')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'inbox' ? <WebmentionInboxView /> : <WebmentionOutboxView />}
    </AdminListPage>
  )
}
