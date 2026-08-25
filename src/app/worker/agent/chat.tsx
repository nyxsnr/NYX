'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Card } from '@/components/ui';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  actions?: Array<{ label: string; actionType: string; href: string | null }>;
}

const STARTERS = [
  "I don't know what work I can do.",
  'What should I do next to get hired?',
  'Why am I not getting any replies?',
  'How do I improve my CV?',
  'Help me prepare for an interview.',
];

export function AgentChat({ readinessScore, firstName }: { readinessScore: number; firstName: string }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        `Hello ${firstName}. Your work readiness is ${readinessScore}/100.\n\n` +
        'I can help you work out what you are able to do, prove it, and find work that matches. ' +
        'I will not promise you a job — nobody honestly can — but I can tell you exactly what raises your odds.\n\n' +
        'What would you like to work on?',
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);

    try {
      const response = await api.post<{
        conversationId: string;
        reply: string;
        suggestedActions: Array<{ label: string; actionType: string; href: string | null }>;
      }>('/api/worker/agent', { message: text, conversationId });

      setConversationId(response.conversationId);
      setMessages((prev) => [...prev, { role: 'assistant', content: response.reply, actions: response.suggestedActions }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The assistant is unavailable right now.');
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {messages.map((message, index) => (
          <div key={index} className={message.role === 'user' ? 'flex justify-end' : ''}>
            <div className={`card max-w-[46rem] p-4 ${message.role === 'user' ? 'surface-sunken' : ''}`}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {message.role === 'user' ? 'You' : 'Career agent'}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>

              {message.actions && message.actions.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.actions.map((action) =>
                    action.href ? (
                      <Link key={action.label} href={action.href} className="btn btn-secondary px-3 text-sm">
                        {action.label}
                      </Link>
                    ) : null,
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {busy ? (
          <div className="card max-w-[46rem] p-4">
            <p className="text-sm text-muted">Thinking…</p>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      {messages.length === 1 ? (
        <div className="flex flex-wrap gap-2">
          {STARTERS.map((starter) => (
            <button key={starter} type="button" className="tap rounded-full border px-3 py-2 text-sm" onClick={() => void send(starter)}>
              {starter}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card className="sticky bottom-20 lg:bottom-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <label className="sr-only" htmlFor="agent-input">
            Message the career agent
          </label>
          <input
            id="agent-input"
            className="input flex-1"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about your work and career…"
            disabled={busy}
            maxLength={4000}
          />
          <button type="submit" className="btn btn-primary px-5" disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">
          The agent gives evidence-based advice. It cannot promise employment or income.
        </p>
      </Card>
    </div>
  );
}
