/**
 * Session-list DTOs consumed by both the admin/me route loaders and the
 * session views. Defined here so `ui/` never imports route modules for
 * types (routes ↔ ui type cycles are a split-package blocker).
 */

/** Admin session-management row (all sessions, any user). */
export interface AdminSessionItem {
  sid: string
  userId: string
  userName: string
  userEmail: string
  userRole: 'admin' | 'author' | 'visitor' | null
  userAgent: string
  platformHint: string | null
  ip: string
  loginAtIso: string
  lastActiveAtIso: string
  expiresAtIso: string
  isCurrent: boolean
}

/** "My sessions" row (the current user's own devices). */
export interface MySessionItem {
  sid: string
  userAgent: string
  platformHint: string | null
  ip: string
  loginAtIso: string
  lastActiveAtIso: string
  expiresAtIso: string
  isCurrent: boolean
}
