import { Tabs, TabsList, TabsTrigger } from '@kobato/ui/components/tabs.tsx'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { AdminListPage } from '@kobato/web-admin/ui/shared/AdminListPage.tsx'
import { WebmentionInboxView } from '@kobato/web-admin/ui/webmentions/WebmentionInboxView.tsx'
import { WebmentionOutboxView } from '@kobato/web-admin/ui/webmentions/WebmentionOutboxView.tsx'

export type WebmentionTab = 'inbox' | 'outbox'

function isWebmentionTab(value: unknown): value is WebmentionTab {
  return value === 'inbox' || value === 'outbox'
}

// One page, both directions: the moderation queue (inbox) and the read-only
// outbound send log (outbox). Pure-props: the route owns the tab state and
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
