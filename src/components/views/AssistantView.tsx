import { Check, Globe, Loader2, Send, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { t } from '../../shared/i18n.ts';
import type { AssistantMessage, Project, StudioSettings } from '../../shared/types.ts';
import { api } from '../../services/api.ts';

interface AssistantViewProps {
  settings: StudioSettings;
  project: Project | null;
  onProjectDataChanged: () => Promise<void>;
}

export function AssistantView({
  settings,
  project,
  onProjectDataChanged,
}: AssistantViewProps) {
  const lang = settings.language;
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!project) return;
    api
      .listAssistantMessages(project.id)
      .then(setMessages)
      .catch(() => {});
  }, [project]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!project) {
    return (
      <div className="p-8 bg-[#131519] border border-[#262A33] rounded-md text-sm text-[#8E96A4]">
        {t(lang, 'emptyProjectPrompt')}
      </div>
    );
  }

  const quickPrompts =
    lang === 'en'
      ? [
          'Create a realistic 35-year-old male lead character with lived-in physical traits.',
          'Create an atmospheric interior location matching this project visual tone.',
          'Propose a dramatic opening scene using our existing characters and locations.',
          'Propose a 6-shot cinematic storyboard breakdown for our first scene.',
        ]
      : [
          'Crée un personnage masculin de 35 ans avec une apparence réaliste et marquée.',
          'Crée un décor intérieur cinématographique adapté à la tonalité du projet.',
          'Propose une scène d’ouverture dramatique utilisant nos personnages existants.',
          'Propose un découpage cinématographique en 6 plans pour notre première scène.',
        ];

  const handleSend = async (customText?: string) => {
    const text = (customText ?? input).trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setInput('');
    try {
      await api.sendAssistantMessage(project.id, text);
      const updated = await api.listAssistantMessages(project.id);
      setMessages(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const handleApprove = async (msgId: string) => {
    setExecutingId(msgId);
    setError(null);
    try {
      await api.executeAssistantProposal(project.id, msgId);
      const updated = await api.listAssistantMessages(project.id);
      setMessages(updated);
      await onProjectDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExecutingId(null);
    }
  };

  const handleDismiss = async (msgId: string) => {
    await api.dismissAssistantProposal(project.id, msgId);
    const updated = await api.listAssistantMessages(project.id);
    setMessages(updated);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-116px)] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#ECEEF2]">
            {t(lang, 'aiAssistantTitle')}
          </h1>
          <p className="text-xs text-[#8E96A4] mt-1">{t(lang, 'aiAssistantSubtitle')}</p>
        </div>
        <span className="text-xs text-[#C9A66B] inline-flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" />
          {t(lang, 'requiresInternet')}
        </span>
      </div>

      {error && (
        <div className="p-3 bg-[#2A1417] border border-[#7F1D1D] rounded-md text-xs text-[#FCA5A5]">
          {error}
        </div>
      )}

      {/* Conversation Container */}
      <div className="flex-1 bg-[#131519] border border-[#262A33] rounded-lg flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto py-8 space-y-5">
              <div className="text-center space-y-2">
                <Sparkles className="w-7 h-7 text-[#C9A66B] mx-auto" />
                <h2 className="font-display text-lg font-semibold text-[#ECEEF2]">
                  {lang === 'en'
                    ? `Project context loaded: ${project.title}`
                    : `Contexte chargé : ${project.title}`}
                </h2>
                <p className="text-xs text-[#8E96A4]">
                  {lang === 'en'
                    ? 'Every important action is presented as a proposal requiring your explicit approval before saving.'
                    : 'Chaque action importante est soumise sous forme de proposition attendant votre validation explicite.'}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {quickPrompts.map((qp) => (
                  <button
                    key={qp}
                    type="button"
                    onClick={() => handleSend(qp)}
                    className="p-3.5 text-left text-xs bg-[#0B0C0E] border border-[#262A33] hover:border-[#C9A66B] text-[#C6CDD8] hover:text-[#ECEEF2] rounded-md transition-colors leading-relaxed"
                  >
                    {qp}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-3xl rounded-lg p-4 space-y-3 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[#1D2028] text-[#ECEEF2] border border-[#2F3542]'
                      : 'bg-[#0B0C0E] text-[#D8DDE6] border border-[#262A33]'
                  }`}
                >
                  <div className="text-[11px] text-[#7D8594] font-mono">
                    {m.role === 'user'
                      ? lang === 'en'
                        ? 'Director'
                        : 'Réalisateur'
                      : 'CineStudio AI Assistant'}
                  </div>
                  <div className="whitespace-pre-wrap">{m.content}</div>

                  {m.proposal && (
                    <div className="p-3.5 bg-[#131519] border border-[#C9A66B]/40 rounded-md space-y-2.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-[#C9A66B]">
                          {lang === 'en' ? 'Proposed Action' : 'Action proposée'} ·{' '}
                          {m.proposal.actionType}
                        </span>
                        <span className="font-mono text-[11px] text-[#8E96A4]">
                          {m.proposal.status === 'executed'
                            ? t(lang, 'proposalExecuted')
                            : m.proposal.status === 'dismissed'
                              ? t(lang, 'proposalDismissed')
                              : lang === 'en'
                                ? 'Awaiting confirmation'
                                : 'En attente de validation'}
                        </span>
                      </div>
                      <p className="text-xs text-[#ECEEF2]">{m.proposal.summary}</p>
                      <pre className="text-[11px] font-mono text-[#8E96A4] bg-[#0B0C0E] p-2.5 rounded overflow-x-auto max-h-36">
                        {JSON.stringify(m.proposal.payload, null, 2)}
                      </pre>
                      {m.proposal.status === 'pending' && (
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleDismiss(m.id)}
                            className="px-3 py-1.5 text-xs text-[#A6AEBC] hover:text-[#ECEEF2] inline-flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" />
                            {t(lang, 'dismissProposal')}
                          </button>
                          <button
                            type="button"
                            disabled={executingId === m.id}
                            onClick={() => handleApprove(m.id)}
                            className="px-4 py-1.5 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] inline-flex items-center gap-1.5"
                          >
                            {executingId === m.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            {t(lang, 'approveAndExecute')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-4 border-t border-[#262A33] bg-[#0F1115] flex items-center gap-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending}
            placeholder={
              lang === 'en'
                ? 'Ask the studio assistant to analyze, propose characters, sets, scenes, or shot prompts...'
                : 'Demandez à l’assistant de créer un personnage, proposer un décor, découper une séquence...'
            }
            className="flex-1 bg-[#0B0C0E] border border-[#262A33] rounded-md px-4 py-2.5 text-sm text-[#ECEEF2] focus:outline-none focus:border-[#C9A66B]"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="px-4 py-2.5 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] disabled:opacity-50 inline-flex items-center gap-2 whitespace-nowrap"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {lang === 'en' ? 'Send' : 'Envoyer'}
          </button>
        </form>
      </div>
    </div>
  );
}
