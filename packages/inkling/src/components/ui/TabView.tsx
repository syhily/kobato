import type React from 'react'

import { useState } from 'react'

const TabView = ({
  tabs,
  defaultTab,
  tabContent,
}: {
  tabs: { id: string; label: string }[]
  defaultTab?: string
  tabContent: Record<string, React.ReactNode>
}) => {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id ?? '')

  // The stored tab can go stale when the `tabs` prop changes; fall back to the first tab instead of rendering nothing.
  const currentTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : (tabs[0]?.id ?? '')

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
  }

  return (
    <>
      <div
        className={`no-scrollbar flex gap-4 border-b border-grey-300 dark:border-grey-900 ${tabs.length > 1 ? 'w-full px-6' : 'mx-6'}`}
      >
        {tabs.map((tab: { id: string; label: string }) => (
          <button
            key={tab.id}
            className={`-mb-px appearance-none pt-4 pb-3 text-sm font-semibold whitespace-nowrap transition-all ${
              tabs.length > 1 ? 'cursor-pointer border-b-2' : 'cursor-default'
            } ${
              currentTab === tab.id
                ? 'border-black text-black dark:border-white dark:text-white'
                : 'border-transparent text-grey-600 hover:border-grey-500 dark:text-grey-500 dark:hover:border-grey-500'
            }`}
            data-testid={`tab-${tab.id}`}
            type="button"
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3 p-6 pt-4" data-testid={`tab-contents-${currentTab}`}>
        {tabContent[currentTab]}
      </div>
    </>
  )
}

export { TabView }
