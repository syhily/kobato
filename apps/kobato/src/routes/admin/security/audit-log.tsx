import { requireRole } from '@kobato/server/domains/auth/rbac'
import { getRequestContext } from '@kobato/server/http/request-context'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import { AuditLogView } from '@kobato/web-admin/ui/audit/AuditLogView'

import { titleMeta } from '@/seo/title-meta'

import type { Route } from './+types/audit-log'

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  requireRole(rc.viewer ?? undefined, 'admin')
  const bundle = getBlogSettingsBundleSync()
  return {
    retentionDays: bundle?.limits?.auditLogDbRetentionDays ?? 30,
  }
}

export const meta = titleMeta('meta.title.admin.auditLog')

export default function AuditLogPage({ loaderData }: Route.ComponentProps) {
  return <AuditLogView retentionDays={loaderData.retentionDays} />
}
