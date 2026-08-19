import { requireRole } from '@/server/domains/auth/rbac'
import { getRequestContext } from '@/server/http/request-context'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { titleMeta } from '@/shared/seo/title-meta'
import { AuditLogView } from '@/ui/admin/audit/AuditLogView'

import type { Route } from './+types/audit-log'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole(rc.viewer ?? undefined, 'admin')
  const bundle = getBlogSettingsBundleSync()
  return {
    retentionDays: bundle?.limits?.auditLogDbRetentionDays ?? 30,
  }
}

export const meta = titleMeta('审计日志')

export default function AuditLogPage({ loaderData }: Route.ComponentProps) {
  return <AuditLogView retentionDays={loaderData.retentionDays} />
}
