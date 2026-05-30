export const userSortOrders = ['recent', 'commentCount'] as const
export type UserSortOrder = (typeof userSortOrders)[number]

export interface ListUsersInput {
  offset?: number
  limit?: number
  q?: string
  role?: 'all' | 'admin' | 'author' | 'visitor' | 'normal'
  includeDeleted?: boolean
  sortBy?: UserSortOrder
  hasPosts?: boolean
  hasPages?: boolean
}

export interface UserIdInput {
  userId: string
}

export interface MuteUserInput extends UserIdInput {
  muted: boolean
}

export interface AdminUserDto {
  id: string
  name: string
  email: string
  link: string | null
  badgeName: string | null
  badgeColor: string | null
  badgeTextColor: string | null
  role: 'admin' | 'author' | 'visitor' | null
  isMuted: boolean
  emailVerified: boolean
  createdAt: string
  deletedAt: string | null
  lastIp: string | null
  lastUa: string | null
  commentCount: number
  pendingCount: number
  lastCommentAt: string | null
}

export interface UpdateUserInput {
  userId: string
  name?: string
  email?: string
  link?: string
  badgeName?: string
  badgeColor?: string
  badgeTextColor?: string | null
}

export interface UpdateUserOutput {
  success: true
}

export interface ListUsersOutput {
  users: AdminUserDto[]
  total: number
  hasMore: boolean
}

export interface GetUserOutput {
  user: AdminUserDto
}

export interface MuteUserOutput {
  user: AdminUserDto
}

export interface BulkApproveOutput {
  approved: number
}

export interface BulkSoftDeleteOutput {
  deleted: number
}

export interface AdminMutationSuccessOutput {
  success: boolean
}
