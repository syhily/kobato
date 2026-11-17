import { createORPCReactQueryUtils } from '@orpc/react-query'

import { orpc } from './client'

export const orpcQuery = createORPCReactQueryUtils(orpc)
