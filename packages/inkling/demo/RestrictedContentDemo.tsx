import { ListItemNode, ListNode } from '@lexical/list'
import React from 'react'
import { useLocation } from 'react-router-dom'

import { MINIMAL_NODES, RestrictContentPlugin } from '@/core'

import { DemoEditorShell } from './components/DemoEditorShell'

// The core entry requires the host to name its node set. MINIMAL_NODES alone
// would reject pasted list JSON, so the list pair joins explicitly.
const RESTRICTED_DEMO_NODES = [...MINIMAL_NODES, ListNode, ListItemNode]

function useQuery() {
  const { search } = useLocation()

  return React.useMemo(() => new URLSearchParams(search), [search])
}

interface RestrictedContentDemoProps {
  paragraphs?: number
}

function RestrictedContentDemo({ paragraphs: propParagraphs }: RestrictedContentDemoProps) {
  const query = useQuery()
  const queryParagraphs = query.get('paragraphs')
  // null means the param is absent (Number(null) would be 0, not NaN); a present
  // value is trusted like the prop path, so an explicit `?paragraphs=0` is kept —
  // but a garbage value still falls back to 1 instead of leaking NaN downstream
  const parsed = queryParagraphs === null ? 1 : Number(queryParagraphs)
  const paragraphs = propParagraphs ?? (Number.isFinite(parsed) ? parsed : 1)

  return (
    <DemoEditorShell nodes={RESTRICTED_DEMO_NODES}>
      <RestrictContentPlugin paragraphs={paragraphs} />
    </DemoEditorShell>
  )
}

export default RestrictedContentDemo
