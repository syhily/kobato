export type SidebarRevisionSummary =
  | { kind: 'no-revision' }
  | { kind: 'published-current'; revisionNo: number }
  | { kind: 'draft-ahead'; draftRevisionNo: number; publishedRevisionNo: number | null }

export type SidebarSaveStatus =
  | { kind: 'unsaved' }
  | { kind: 'saving' }
  | { kind: 'saved'; atMs: number }
  | { kind: 'error'; message: string }
  | { kind: 'conflict' }
  | { kind: 'info'; message: string }

export type SidebarPublishStatus = 'never-saved' | 'offline' | 'scheduled' | 'live' | 'live-with-draft-ahead'
