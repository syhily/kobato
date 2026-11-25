import { MINIMAL_NODES, RestrictContentPlugin } from '@kobato/inkling'
import { DemoEditorShell } from '@kobato/inkling-demo/components/DemoEditorShell'
import { ListItemNode, ListNode } from '@lexical/list'
import { useMemo } from 'react'
import { useLocation } from 'react-router'

const RESTRICTED_DEMO_NODES = [...MINIMAL_NODES, ListNode, ListItemNode]

function useQuery() {
  const { search } = useLocation()

  return useMemo(() => new URLSearchParams(search), [search])
}

interface RestrictedContentDemoProps {
  paragraphs?: number
}

function RestrictedContentDemo({ paragraphs: propParagraphs }: RestrictedContentDemoProps) {
  const query = useQuery()
  const queryParagraphs = query.get('paragraphs')
  const parsed = queryParagraphs === null ? 1 : Number(queryParagraphs)
  const paragraphs = propParagraphs ?? (Number.isFinite(parsed) ? parsed : 1)

  return (
    <DemoEditorShell nodes={RESTRICTED_DEMO_NODES}>
      <RestrictContentPlugin paragraphs={paragraphs} />
    </DemoEditorShell>
  )
}

export default RestrictedContentDemo
