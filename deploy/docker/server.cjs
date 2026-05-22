/**
 * Express server wrapper for Netlify Functions
 *
 * This server adapts Netlify function handlers to work in a Docker container.
 * It serves the static Vite build and routes /api/* requests to the appropriate
 * function handlers.
 */

const express = require('express')
const path = require('path')
const fs = require('fs')

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Serve static files from the Vite build
app.use(express.static(path.join(__dirname, 'dist'), {
  maxAge: '1y',
  etag: true,
  index: 'index.html'
}))

// Build a map of available functions (excluding utility modules that start with _)
const functionsDir = path.join(__dirname, 'netlify', 'functions')
const availableFunctions = new Set()

try {
  const files = fs.readdirSync(functionsDir)
  files.forEach(file => {
    if (file.endsWith('.js') && !file.startsWith('_')) {
      availableFunctions.add(file.replace('.js', ''))
    }
  })
  console.log(`Loaded ${availableFunctions.size} API functions`)
} catch (err) {
  console.error('Failed to load functions directory:', err.message)
}

/**
 * Adapt Express request to Netlify function event format
 */
function createNetlifyEvent(req) {
  return {
    httpMethod: req.method,
    path: req.path,
    headers: req.headers,
    queryStringParameters: req.query || {},
    body: req.body ? JSON.stringify(req.body) : null,
    isBase64Encoded: false
  }
}

/**
 * API route handler - routes requests to Netlify function handlers
 */
app.all('/api/:functionName', async (req, res) => {
  const { functionName } = req.params

  // Check if function exists
  if (!availableFunctions.has(functionName)) {
    return res.status(404).json({ error: `Function '${functionName}' not found` })
  }

  try {
    // Load the function handler
    const functionPath = path.join(functionsDir, `${functionName}.js`)

    // Clear require cache in development for hot reload
    if (process.env.NODE_ENV === 'development') {
      delete require.cache[require.resolve(functionPath)]
    }

    const handler = require(functionPath)

    // Create Netlify-compatible event object
    const event = createNetlifyEvent(req)

    // Call the handler
    const response = await handler.handler(event)

    // Send response with headers
    if (response.headers) {
      Object.entries(response.headers).forEach(([key, value]) => {
        res.setHeader(key, value)
      })
    }

    res.status(response.statusCode || 200)

    // Parse body if it's JSON string
    if (response.body) {
      try {
        const parsed = JSON.parse(response.body)
        res.json(parsed)
      } catch {
        res.send(response.body)
      }
    } else {
      res.end()
    }

  } catch (err) {
    console.error(`Error in function '${functionName}':`, err)
    res.status(500).json({ error: err.message || 'Internal server error' })
  }
})

// SPA fallback - serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Environment: ${process.env.NODE_ENV || 'production'}`)
})
