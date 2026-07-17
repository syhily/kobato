import type { BridgeEnsureKey, PmBlockNode } from '@/shared/pt/bridge/types'
import type { HorizontalRuleBlock } from '@/shared/pt/schema'

export function horizontalRuleBlockToPmNode(_block: HorizontalRuleBlock): PmBlockNode {
  return { type: 'horizontalRule', attrs: { _key: _block._key } }
}

export function pmHorizontalRuleToBlock(node: PmBlockNode, ensureKey: BridgeEnsureKey): HorizontalRuleBlock {
  return { _type: 'horizontalRule', _key: ensureKey(node.attrs) }
}
