import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { AdminListPage } from '@kobato/ui/admin/shared/AdminListPage'
import { WebmentionInboxView } from '@kobato/ui/admin/webmentions/WebmentionInboxView'
import { WebmentionOutboxView } from '@kobato/ui/admin/webmentions/WebmentionOutboxView'
import { Tabs, TabsList, TabsTrigger } from '@kobato/ui/components/tabs'
import { useState } from 'react'

type WebmentionTab = 'inbox' | 'outbox'

// The Webmention page: one page, both directions —「接收审核」(the
// moderation queue other sites' mentions land in) and「发送日志」(the
// read-only outbound send log). Local tab state; a refresh lands back on
// the inbox, which is where the admin's action queue lives.
export function WebmentionsView() {
  const [tab, setTab] = useState<WebmentionTab>('inbox')

  return (
    <AdminListPage>
      <AdminListPage.Header
        title="Webmention 管理"
        description="其他站点引用你的内容时会向本站发送 Webmention，审核通过后显示在文章页「引用与回应」区块；发送日志记录本站向外发出的提及。"
      />

      {/* The TabsTrigger set above is the only string the select can emit. */}
      <Tabs value={tab} onValueChange={(value) => setTab(unsafeCast<WebmentionTab>(value))}>
        <TabsList>
          <TabsTrigger value="inbox">接收审核</TabsTrigger>
          <TabsTrigger value="outbox">发送日志</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'inbox' ? <WebmentionInboxView /> : <WebmentionOutboxView />}
    </AdminListPage>
  )
}
