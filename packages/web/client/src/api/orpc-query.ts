import { orpc } from '@kobato/web-client/api/client'
import { createORPCReactQueryUtils } from '@orpc/react-query'

export const orpcQuery = createORPCReactQueryUtils(orpc)
