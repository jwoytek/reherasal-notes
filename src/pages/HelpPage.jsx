import { useState, useRef, useEffect } from 'react'
import { OVA_SYSTEM_PROMPT } from '../lib/ovaSystemPrompt'

const SUGGESTED_QUESTIONS = [
  'How do I add my cast members?',
  'How do I print the check-in QR code?',
  'How does the show clock work?',
  'Can I use Ovature for a concert?',
  'How do I set up multiple productions?',
  'What is the SM Dashboard?',
]

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '12px 16px' }}>
      {[0,1,2].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: '50%',
          background: 'rgba(255,255,255,0.4)',
          animation: 'bounce 1.2s infinite',
          animationDelay: `${i * 0.2}s`
        }} />
      ))}
    </div>
  )
}

export default function HelpPage() {
  const [configured, setConfigured] = useState(null) // null = checking, true/false = result
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // Check if Ova is configured on mount
  useEffect(() => {
    fetch('/.netlify/functions/chatProxy', { method: 'GET' })
      .then(res => res.json())
      .then(data => {
        setConfigured(data.configured)
        setMessages([{
          role: 'assistant',
          content: data.configured
            ? "Hi! I'm Ova, your Ovature assistant 🎭 I can help you get started, walk you through any feature, or answer questions about running your production. What can I help you with?"
            : "I'm currently offline. The AI assistant hasn't been configured for this deployment. Please check the documentation for setup instructions."
        }])
      })
      .catch(() => {
        setConfigured(false)
        setMessages([{ role: 'assistant', content: "I'm currently unavailable. Please try again later." }])
      })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text) {
    const userText = text || input.trim()
    if (!userText || loading) return
    setInput('')
    setError(null)

    const newMessages = [...messages, { role: 'user', content: userText }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const res = await fetch('/.netlify/functions/chatProxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: OVA_SYSTEM_PROMPT,
          messages: newMessages.map(m => ({ role: m.role, content: m.content }))
        })
      })
      const data = await res.json()
      const reply = data.content?.find(b => b.type === 'text')?.text || 'Sorry, I had trouble with that. Try again?'
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (e) {
      setError('Connection error — please try again.')
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const showSuggestions = messages.length === 1

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0f1a',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'DM Sans', -apple-system, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .msg { animation: fadeUp 0.25s ease; }
        .suggestion-btn:hover { background: rgba(167,139,250,0.15) !important; border-color: rgba(167,139,250,0.4) !important; }
        .send-btn:hover:not(:disabled) { background: #7c3aed !important; }
        textarea:focus { outline: none; border-color: rgba(167,139,250,0.5) !important; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'rgba(255,255,255,0.02)',
        backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #1a365d, #2d5a8e)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, boxShadow: '0 2px 12px rgba(26,54,93,0.5)'
          }}>🎭</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '-0.3px', lineHeight: 1 }}>Ovature</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Help Center</div>
          </div>
        </a>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: configured === null ? 'rgba(255,255,255,0.4)' : configured ? '#34d399' : '#fbbf24',
            boxShadow: configured ? '0 0 6px #34d399' : 'none'
          }} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            {configured === null ? 'Connecting…' : configured ? 'Ova is online' : 'Ova is offline'}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760, width: '100%', margin: '0 auto' }}>

        {messages.map((msg, i) => (
          <div key={i} className="msg" style={{
            display: 'flex',
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            alignItems: 'flex-end', gap: 10
          }}>
            {msg.role === 'assistant' && (
              <div style={{
                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                background: 'linear-gradient(135deg, #1a365d, #2d5a8e)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16
              }}>🎭</div>
            )}
            <div style={{
              maxWidth: '80%',
              padding: '12px 16px',
              borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: msg.role === 'user'
                ? 'linear-gradient(135deg, #1a365d, #2563eb)'
                : 'rgba(255,255,255,0.06)',
              border: msg.role === 'user' ? 'none' : '0.5px solid rgba(255,255,255,0.1)',
              fontSize: 14,
              lineHeight: 1.6,
              color: '#fff',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="msg" style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10, flexShrink: 0,
              background: 'linear-gradient(135deg, #1a365d, #2d5a8e)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
            }}>🎭</div>
            <div style={{
              background: 'rgba(255,255,255,0.06)',
              border: '0.5px solid rgba(255,255,255,0.1)',
              borderRadius: '18px 18px 18px 4px',
            }}>
              <TypingIndicator />
            </div>
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', fontSize: 13, color: '#fca5a5', padding: '8px 16px',
            background: 'rgba(239,68,68,0.1)', borderRadius: 8, border: '0.5px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        {/* Suggested questions */}
        {showSuggestions && !loading && configured && (
          <div className="msg" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingLeft: 42 }}>
            {SUGGESTED_QUESTIONS.map(q => (
              <button key={q} className="suggestion-btn" onClick={() => send(q)}
                style={{
                  padding: '7px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  background: 'rgba(167,139,250,0.08)', color: 'rgba(255,255,255,0.7)',
                  border: '0.5px solid rgba(167,139,250,0.2)', transition: 'all 0.15s',
                  fontFamily: 'inherit'
                }}>
                {q}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 16px 24px',
        borderTop: '0.5px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.3)',
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={configured ? "Ask me anything about Ovature…" : "Ova is offline"}
            rows={1}
            disabled={loading || !configured}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 14, fontSize: 14,
              background: 'rgba(255,255,255,0.06)',
              border: '0.5px solid rgba(255,255,255,0.12)',
              color: '#fff', resize: 'none', lineHeight: 1.5,
              fontFamily: 'inherit', transition: 'border-color 0.15s',
              maxHeight: 120, overflowY: 'auto',
              opacity: configured ? 1 : 0.5,
            }}
            onInput={e => {
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
          />
          <button className="send-btn" onClick={() => send()} disabled={!input.trim() || loading || !configured}
            style={{
              width: 44, height: 44, borderRadius: 12, border: 'none', cursor: 'pointer',
              background: input.trim() && !loading && configured ? '#5b21b6' : 'rgba(255,255,255,0.08)',
              color: input.trim() && !loading && configured ? '#fff' : 'rgba(255,255,255,0.3)',
              fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', flexShrink: 0,
            }}>
            ↑
          </button>
        </div>
        <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 8 }}>
          Ova can make mistakes. For urgent show day issues, contact your director directly.
        </p>
      </div>
    </div>
  )
}
