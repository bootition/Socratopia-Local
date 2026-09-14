import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/main/**/*.test.ts', 'tests/shared/**/*.test.ts']
        }
      },
      {
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          setupFiles: ['tests/renderer/setup.ts'],
          include: ['tests/renderer/**/*.test.ts', 'tests/renderer/**/*.test.tsx']
        }
      }
    ]
  }
})
