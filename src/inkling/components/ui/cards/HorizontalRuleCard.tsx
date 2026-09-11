export function HorizontalRuleCard() {
  return <hr className="border-grey-300 m-0 block h-[1px] border-0 border-t" />
}

/**
 * HorizontalRule's decorate render — the React-bearing half of its
 * decorate-target, paired with the declaration by
 * `@/inkling/nodes/cards/card-decorate`. Takes no node props.
 */
export function renderHorizontalRuleCard() {
  return <HorizontalRuleCard />
}
