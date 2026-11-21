export interface AdminSessionItem {
  sid: string
  userId: string
  userName: string
  userEmail: string
  userRole: 'admin' | 'author' | 'visitor' | null
  label: string
  ip: string
  loginAtIso: string
  lastActiveAtIso: string
  expiresAtIso: string
  isCurrent: boolean
}

export interface MySessionItem {
  sid: string
  label: string
  ip: string
  loginAtIso: string
  lastActiveAtIso: string
  expiresAtIso: string
  isCurrent: boolean
}
