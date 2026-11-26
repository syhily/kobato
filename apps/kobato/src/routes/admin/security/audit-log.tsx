import { awaitRootBootstrap, requireRoleFromBootstrap } from '@/lib/root-bootstrap'
import { titleMeta } from '@/seo/title-meta'
import { AuditLogView } from '@/ui/audit/AuditLogView'

import type { Route } from './+types/audit-log'

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const boot = await awaitRootBootstrap()
  requireRoleFromBootstrap(boot, 'admin', { pathname: new URL(request.url).pathname })
  const bundle = boot.blogSettings
  return {
    retentionDays: bundle?.limits?.auditLogDbRetentionDays ?? 30,
  }
}

export const meta = titleMeta('meta.title.admin.auditLog')

export default function AuditLogPage({ loaderData }: Route.ComponentProps) {
  return <AuditLogView retentionDays={loaderData.retentionDays} />
}
