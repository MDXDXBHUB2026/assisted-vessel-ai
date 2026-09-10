import { useState } from 'react'
import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { localDeterministicCopilotService, suggestedCopilotQuestions } from '@/services/copilotService'
import { Bot, Send, User } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  text: string
  evidence?: string[]
}

export function CopilotPage() {
  const state = useSimulationStore()
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: 'I can answer questions about the current operating picture using live simulation state. Ask me about machinery, navigation, fuel, safety, or shore support.' },
  ])
  const [input, setInput] = useState('')

  const send = async (question: string) => {
    if (!question.trim()) return
    setMessages((prev) => [...prev, { role: 'user', text: question }])
    setInput('')
    const response = await localDeterministicCopilotService.ask(question, state)
    setMessages((prev) => [...prev, { role: 'assistant', text: response.answer, evidence: response.evidence }])
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <Bot size={18} className="text-info-400" /> Operations Copilot
        </h1>
        <p className="text-sm text-ink-500">Deterministic, state-aware answers for today&rsquo;s prototype. No external model is called — the interface is designed so a secured LLM/RAG service could be connected later without UI changes.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {suggestedCopilotQuestions().map((q) => (
          <button key={q} onClick={() => send(q)} className="rounded-full border border-hull-500/40 px-3 py-1 text-xs text-ink-400 hover:border-info-500/40 hover:text-info-400">
            {q}
          </button>
        ))}
      </div>

      <Panel className="flex flex-1 flex-col overflow-hidden" dense>
        <div className="flex-1 space-y-3 overflow-y-auto px-1 py-1">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${m.role === 'user' ? 'bg-hull-700 text-ink-300' : 'bg-info-500/15 text-info-400'}`}>
                {m.role === 'user' ? <User size={13} /> : <Bot size={13} />}
              </div>
              <div className={`max-w-2xl rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'bg-hull-700 text-ink-100' : 'border border-panel-border bg-panel-raised text-ink-200'}`}>
                <p>{m.text}</p>
                {m.evidence && m.evidence.length > 0 && <p className="mt-1.5 text-[11px] text-ink-500">Sources: {m.evidence.join(', ')}</p>}
              </div>
            </div>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
          className="mt-2 flex gap-2 border-t border-panel-border pt-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about current operating conditions…"
            className="flex-1 rounded-md border border-hull-500/40 bg-hull-800 px-3 py-2 text-sm text-ink-100"
          />
          <Button variant="primary" size="sm" type="submit" icon={<Send size={14} />}>
            Ask
          </Button>
        </form>
      </Panel>
    </div>
  )
}
