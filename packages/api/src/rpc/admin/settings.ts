import {
  adminSettingsBootstrapOutputSchema,
  adminSettingsUpdateInput,
  adminSettingsUpdateOutput,
} from '@kobato/api/contracts/admin/settings'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminSettingsContract = {
  update: defineProcedure({ method: 'POST', path: '/admin/settings/update' })
    .input(adminSettingsUpdateInput)
    .output(adminSettingsUpdateOutput),
  bootstrap: defineProcedure({ method: 'GET', path: '/admin/settings/bootstrap' }).output(
    adminSettingsBootstrapOutputSchema,
  ),
}
