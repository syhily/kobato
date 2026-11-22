import { inklingUnitProject } from '@kobato/test/projects/inkling-unit'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

export default inklingUnitProject([svgr(), react({ compiler: true })])
