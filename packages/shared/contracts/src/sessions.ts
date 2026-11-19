export interface AdminSessionItem {
  sid: string
  userId: string
  userName: string
  userEmail: string
  userRole: 'admin' | 'author' | 'visitor' | null
  /** Server-rendered UA label (the browser never parses UAs). */
  label: string
  ip: string
  loginAtIso: string
  lastActiveAtIso: string
  expiresAtIso: string
  isCurrent: boolean
}

export interface MySessionItem {
  sid: string
  /** Server-rendered UA label (the browser never parses UAs). */
  label: string
  ip: string
  loginAtIso: string
  lastActiveAtIso: string
  expiresAtIso: string
  isCurrent: boolean
}
