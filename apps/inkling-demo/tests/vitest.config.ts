import { demoUnitProject } from '@kobato/test/projects/demo-unit'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

export default demoUnitProject([svgr(), react({ compiler: true })])
