export function HorizontalRuleCard() {
  return <hr className="m-0 block h-[1px] border-0 border-t border-grey-300" />
}

/**
 * HorizontalRule's decorate render — the React-bearing half of its
 * decorate-target, paired with the declaration by
 * `@/nodes/cards/card-decorate`. Takes no node props.
 */
export function renderHorizontalRuleCard() {
  return <HorizontalRuleCard />
}
