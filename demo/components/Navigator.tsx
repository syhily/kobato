import { useEffect } from 'react'
import { useNavigate, type NavigateFunction } from 'react-router'

declare global {
  interface Window {
    navigate?: NavigateFunction
  }
}

const Navigator = () => {
  const navigate = useNavigate()

  // Workaround: lets Playwright navigate without triggering a full page reload.
  useEffect(() => {
    window.navigate = navigate
  }, [navigate])

  return null
}

export default Navigator
