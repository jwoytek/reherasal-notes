import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    extends: './vitest.config.js',
    test: {
      name: 'smoke',
      include: ['tests/smoke/**/*.test.{js,jsx}']
    }
  },
  {
    extends: './vitest.config.js',
    test: {
      name: 'regression',
      include: ['tests/**/*.test.{js,jsx}']
    }
  }
])
