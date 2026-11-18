import {
  auditLogActorsOutput,
  auditLogExportInput,
  auditLogExportOutput,
  auditLogListInput,
  auditLogListOutput,
} from '@kobato/contracts/audit.ts'
import { oc } from '@orpc/contract'

// Admin audit-log RPC contract — admin base on the server.
export const adminAuditContract = {
  list: oc.route({ method: 'GET', path: '/admin/audit-log/list' }).input(auditLogListInput).output(auditLogListOutput),
  exportCsv: oc
    .route({ method: 'POST', path: '/admin/audit-log/export' })
    .input(auditLogExportInput)
    .output(auditLogExportOutput),
  actors: oc.route({ method: 'GET', path: '/admin/audit-log/actors' }).output(auditLogActorsOutput),
}
