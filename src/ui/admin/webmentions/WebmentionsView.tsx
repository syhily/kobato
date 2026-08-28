import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { WebmentionInboxView } from '@/ui/admin/webmentions/WebmentionInboxView'
import { WebmentionOutboxView } from '@/ui/admin/webmentions/WebmentionOutboxView'
import { Tabs, TabsList, TabsTrigger } from '@/ui/components/tabs'

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
  return (
    <AdminListPage>
      <AdminListPage.Header
        title="Webmention 管理"
        description="其他站点引用你的内容时会向本站发送 Webmention，审核通过后显示在文章页「引用与回应」区块；发送日志记录本站向外发出的提及。"
      />

      <Tabs
        value={tab}
        onValueChange={(value: unknown) => {
          if (isWebmentionTab(value)) {
            onTabChange(value)
          }
        }}
      >
        <TabsList>
          <TabsTrigger value="inbox">接收审核</TabsTrigger>
          <TabsTrigger value="outbox">发送日志</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'inbox' ? <WebmentionInboxView /> : <WebmentionOutboxView />}
    </AdminListPage>
  )
}
