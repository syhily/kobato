import { useEffect, type RefObject } from 'react'

interface UseAutoExpandTextAreaOptions {
  el: RefObject<HTMLTextAreaElement | null>
  value: string
}

const useAutoExpandTextArea = ({ el, value }: UseAutoExpandTextAreaOptions): void => {
  useEffect(() => {
    const element = el.current
    if (element) {
      element.style.height = '0px'
      const height = element.scrollHeight
      element.style.height = `${height}px`
    }
  }, [el, value])
}

export default useAutoExpandTextArea
