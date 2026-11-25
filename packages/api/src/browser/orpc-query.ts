import { orpc } from '@kobato/api/browser/client'
import { createORPCReactQueryUtils } from '@orpc/react-query'

export const orpcQuery = createORPCReactQueryUtils(orpc)
