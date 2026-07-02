import { createCommand } from 'lexical'

import DividerCardIcon from '@/ui/inkling-editor/assets/icons/inkling-card-type-divider.svg?react'
import InklingCardWrapper from '@/ui/inkling-editor/components/InklingCardWrapper'
import { HorizontalRuleCard } from '@/ui/inkling-editor/components/ui/cards/HorizontalRuleCard'
import { HorizontalRuleNode as BaseHorizontalRuleNode } from '@/ui/inkling-editor/nodes/base'

export const INSERT_HORIZONTAL_RULE_COMMAND = createCommand()

export class HorizontalRuleNode extends BaseHorizontalRuleNode {
  static kgMenu = {
    label: 'Divider',
    desc: 'Insert a dividing line',
    Icon: DividerCardIcon,
    insertCommand: INSERT_HORIZONTAL_RULE_COMMAND,
    matches: ['divider', 'horizontal-rule', 'hr'],
    priority: 2,
    shortcut: '/hr',
  }

  getIcon() {
    return DividerCardIcon
  }

  decorate() {
    return (
      <InklingCardWrapper className="inline-block" nodeKey={this.getKey()}>
        <HorizontalRuleCard />
      </InklingCardWrapper>
    )
  }
}

export function $createHorizontalRuleNode() {
  return new HorizontalRuleNode()
}

export function $isHorizontalRuleNode(node: unknown) {
  return node instanceof HorizontalRuleNode
}
