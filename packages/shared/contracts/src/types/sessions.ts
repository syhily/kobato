/**
 * Session row view-models shared by the `/admin/security/sessions` and
 * `/admin/me/sessions` route loaders (which build them from the account
 * domain's session list) and the `ui/admin` session views that render them.
 */
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
