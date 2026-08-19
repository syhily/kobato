import { guardOnlyLoader } from '@/server/http/request-context'
import { RealtimeFeed } from '@/ui/admin/analytics/RealtimeFeed'

export const loader = guardOnlyLoader('admin')

export default function WpAdminAnalyticsRealtime() {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <RealtimeFeed />
      <div className="rounded-xl border bg-card px-6 py-8 text-sm text-muted-foreground">
        <h2 className="text-sm font-semibold text-foreground">提示</h2>
        <p className="mt-2 leading-relaxed">
          实时面板每两秒拉取一次 access_log 的最新记录。访问统计的批量写入间隔为 1 秒，因此前端最多有 3 秒的延迟。
        </p>
        <p className="mt-3 leading-relaxed">
          目前管理员自身的访问不会被记录（与 metric.pv 计数相同的策略），因此面板上不会出现自己的访问。
        </p>
      </div>
    </div>
  )
}
