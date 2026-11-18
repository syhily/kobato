import {
  adminSettingsBootstrapOutputSchema,
  adminSettingsUpdateInput,
  adminSettingsUpdateOutput,
} from '@kobato/contracts/admin.ts'
import { oc } from '@orpc/contract'

// Admin settings RPC contract — admin base on the server. `update` is the
// strict-keyed section merge patch; `bootstrap` backs the settings layout.
export const adminSettingsContract = {
  update: oc
    .route({ method: 'POST', path: '/admin/settings/update' })
    .input(adminSettingsUpdateInput)
    .output(adminSettingsUpdateOutput),
  bootstrap: oc.route({ method: 'GET', path: '/admin/settings/bootstrap' }).output(adminSettingsBootstrapOutputSchema),
}
