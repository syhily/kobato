import React from 'react'

export interface SharedOnChangeContextValue {
  onChange?: (editorStateJSON: unknown) => void
}

const Context = React.createContext<SharedOnChangeContextValue>({ onChange: undefined })

export const SharedOnChangeContext = ({
  onChange,
  children,
}: {
  onChange?: (editorStateJSON: unknown) => void
  children: React.ReactNode
}) => {
  const onChangeContext = React.useMemo<SharedOnChangeContextValue>(() => ({ onChange }), [onChange])

  return <Context.Provider value={onChangeContext}>{children}</Context.Provider>
}

export const useSharedOnChangeContext = () => React.useContext(Context)
