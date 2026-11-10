import { createORPCReactQueryUtils } from '@orpc/react-query'

import { orpc } from '@/client/api/client'

export const orpcQuery = createORPCReactQueryUtils(orpc)
