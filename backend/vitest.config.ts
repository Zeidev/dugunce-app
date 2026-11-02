import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 15000,
    hookTimeout: 15000,
  },
})
