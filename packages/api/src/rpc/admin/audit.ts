import {
  auditLogActorsOutput,
  auditLogExportInput,
  auditLogExportOutput,
  auditLogListInput,
  auditLogListOutput,
} from '@kobato/api/contracts/admin/audit'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminAuditContract = {
  list: defineProcedure({ method: 'GET', path: '/admin/audit-log/list' })
    .input(auditLogListInput)
    .output(auditLogListOutput),
  exportCsv: defineProcedure({ method: 'POST', path: '/admin/audit-log/export' })
    .input(auditLogExportInput)
    .output(auditLogExportOutput),
  actors: defineProcedure({ method: 'GET', path: '/admin/audit-log/actors' }).output(auditLogActorsOutput),
}
