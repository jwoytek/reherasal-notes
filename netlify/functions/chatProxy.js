'use strict'

const https = require('https')
const { CORS } = require('./_sheets')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }

  // Status check - returns whether Ova is configured
  if (event.httpMethod === 'GET') {
    const configured = !!process.env.ANTHROPIC_API_KEY
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ configured })
    }
  }

  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method not allowed' }

  // Check if API key is configured
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      statusCode: 503,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'AI assistant not configured', unconfigured: true })
    }
  }

  let body
  try { body = JSON.parse(event.body) } catch {
    return { statusCode: 400, headers: CORS, body: 'Invalid JSON' }
  }

  const { messages, system } = body
  if (!messages) return { statusCode: 400, headers: CORS, body: 'messages required' }

  const payload = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system,
    messages,
  })

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      }
    }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: { ...CORS, 'Content-Type': 'application/json' },
          body: data
        })
      })
    })
    req.on('error', e => {
      resolve({ statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) })
    })
    req.write(payload)
    req.end()
  })
}
