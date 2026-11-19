import {
  adminSettingsBootstrapOutputSchema,
  adminSettingsUpdateInput,
  adminSettingsUpdateOutput,
} from '@kobato/contracts/settings.ts'
import { oc } from '@orpc/contract'

export const adminSettingsContract = {
  update: oc
    .route({ method: 'POST', path: '/admin/settings/update' })
    .input(adminSettingsUpdateInput)
    .output(adminSettingsUpdateOutput),
  bootstrap: oc.route({ method: 'GET', path: '/admin/settings/bootstrap' }).output(adminSettingsBootstrapOutputSchema),
}
