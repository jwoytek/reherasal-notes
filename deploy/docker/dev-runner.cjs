/**
 * Development Runner
 *
 * Runs both the Vite dev server (frontend) and Express API server concurrently.
 * This allows hot module replacement for the frontend while the API remains available.
 */

const { spawn } = require('child_process')
const path = require('path')

console.log('Starting development servers...')

// Start Vite dev server
const vite = spawn('npx', ['vite', '--host', '0.0.0.0'], {
  cwd: '/app',
  stdio: 'inherit',
  shell: true
})

// Start Express API server
const api = spawn('node', ['server.cjs'], {
  cwd: '/app',
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development' }
})

// Handle process termination
function cleanup() {
  console.log('\nShutting down...')
  vite.kill()
  api.kill()
  process.exit()
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)

vite.on('exit', (code) => {
  console.log(`Vite exited with code ${code}`)
  cleanup()
})

api.on('exit', (code) => {
  console.log(`API server exited with code ${code}`)
  cleanup()
})
