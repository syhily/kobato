import { createCommand } from 'lexical'

import HtmlCardIcon from '@/ui/inkling-editor/assets/icons/inkling-card-type-html.svg?react'
import HtmlIndicatorIcon from '@/ui/inkling-editor/assets/icons/inkling-indicator-html.svg?react'
import InklingCardWrapper from '@/ui/inkling-editor/components/InklingCardWrapper'
import { HtmlNode as BaseHtmlNode } from '@/ui/inkling-editor/nodes/base'
import { HtmlNodeComponent } from '@/ui/inkling-editor/nodes/HtmlNodeComponent'

export const INSERT_HTML_COMMAND = createCommand()

export class HtmlNode extends BaseHtmlNode {
  static kgMenu = {
    label: 'HTML',
    desc: 'Insert a HTML editor card',
    Icon: HtmlCardIcon,
    insertCommand: INSERT_HTML_COMMAND,
    matches: ['html'],
    priority: 18,
    shortcut: '/html',
  }

  getIcon() {
    return HtmlCardIcon
  }

  // oxlint-disable-next-line typescript/no-explicit-any
  constructor(dataset: Record<string, any> = {}, key?: string) {
    super(dataset, key)
  }

  decorate() {
    return (
      <InklingCardWrapper
        IndicatorIcon={HtmlIndicatorIcon}
        isVisibilityActive={this.getIsVisibilityActive()}
        nodeKey={this.getKey()}
        wrapperStyle="wide"
      >
        {/* oxlint-disable-next-line typescript/no-explicit-any */}
        <HtmlNodeComponent {...({ html: this.__html as string, nodeKey: this.getKey() } as any)} />
      </InklingCardWrapper>
    )
  }
}

// oxlint-disable-next-line typescript/no-explicit-any
export function $createHtmlNode(dataset: Record<string, any>) {
  return new HtmlNode(dataset)
}

export function $isHtmlNode(node: unknown) {
  return node instanceof HtmlNode
}
