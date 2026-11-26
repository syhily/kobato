import { storageObjectInputSchema, storageObjectOutputSchema } from '@kobato/api/contracts/public/storage'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const storageContract = {
  object: defineProcedure({ method: 'GET', path: '/storage/object' }, { publicRead: true })
    .input(storageObjectInputSchema)
    .output(storageObjectOutputSchema),
}
