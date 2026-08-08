import { useState } from 'react'

import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { WebmentionInboxView } from '@/ui/admin/webmentions/WebmentionInboxView'
import { WebmentionOutboxView } from '@/ui/admin/webmentions/WebmentionOutboxView'
import { Tabs, TabsList, TabsTrigger } from '@/ui/components/tabs'

type WebmentionTab = 'inbox' | 'outbox'

// One page, both directions: 「接收审核」(moderation queue) and 「发送日志」
// (read-only outbound log). Local tab state; a refresh lands back on the inbox.
export function WebmentionsView() {
  const [tab, setTab] = useState<WebmentionTab>('inbox')

  return (
    <AdminListPage>
      <AdminListPage.Header
        title="Webmention 管理"
        description="其他站点引用你的内容时会向本站发送 Webmention，审核通过后显示在文章页「引用与回应」区块；发送日志记录本站向外发出的提及。"
      />

      <Tabs value={tab} onValueChange={(value) => setTab(value as WebmentionTab)}>
        <TabsList>
          <TabsTrigger value="inbox">接收审核</TabsTrigger>
          <TabsTrigger value="outbox">发送日志</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'inbox' ? <WebmentionInboxView /> : <WebmentionOutboxView />}
    </AdminListPage>
  )
}
