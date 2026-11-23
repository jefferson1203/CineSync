import {
  Check,
  FileText,
  FileUp,
  Loader2,
  Lock,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { t } from '../../shared/i18n.ts';
import type { Project, Screenplay, StudioSettings } from '../../shared/types.ts';
import { api } from '../../services/api.ts';

interface ScreenplaysViewProps {
  settings: StudioSettings;
  project: Project | null;
  screenplays: Screenplay[];
  onRefresh: () => Promise<void>;
}

export function ScreenplaysView({
  settings,
  project,
  screenplays,
  onRefresh,
}: ScreenplaysViewProps) {
  const lang = settings.language;
  const [selectedId, setSelectedId] = useState<string | null>(screenplays[0]?.id ?? null);
  const [viewTab, setViewTab] = useState<'working' | 'original' | 'analysis'>('working');
  const [showPaste, setShowPaste] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [workingDraft, setWorkingDraft] = useState<string | null>(null);

  const [importChars, setImportChars] = useState(true);
  const [importLocs, setImportLocs] = useState(true);
  const [importScenes, setImportScenes] = useState(true);

  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!project) {
    return (
      <div className="p-8 bg-[#131519] border border-[#262A33] rounded-md text-sm text-[#8E96A4]">
        {t(lang, 'emptyProjectPrompt')}
      </div>
    );
  }

  const selected = screenplays.find((s) => s.id === selectedId) ?? screenplays[0] ?? null;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setStatusMsg(null);
    try {
      const created = await api.uploadScreenplayFile(project.id, file);
      await onRefresh();
      setSelectedId(created.id);
      setWorkingDraft(null);
      setStatusMsg(
        lang === 'en'
          ? `Imported ${file.name}. Original source document preserved untouched.`
          : `Scénario importé (${file.name}). Document source conservé intact.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createScreenplayText(
        project.id,
        pasteTitle.trim() || 'Scénario principal',
        pasteText.trim()
      );
      setPasteTitle('');
      setPasteText('');
      setShowPaste(false);
      await onRefresh();
      setSelectedId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveWorkingCopy = async () => {
    if (!selected || workingDraft === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateScreenplayWorkingCopy(selected.id, { workingText: workingDraft });
      setWorkingDraft(null);
      await onRefresh();
      setStatusMsg(
        lang === 'en'
          ? 'Working copy saved. Original screenplay remains untouched.'
          : 'Version de travail enregistrée. Le scénario original reste intact.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setStatusMsg(null);
    try {
      await api.analyzeScreenplay(selected.id);
      await onRefresh();
      setViewTab('analysis');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleApplyBreakdown = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.applyScreenplayAnalysis(selected.id, {
        importCharacters: importChars,
        importLocations: importLocs,
        importScenes: importScenes,
      });
      await onRefresh();
      setStatusMsg(
        lang === 'en'
          ? `Applied breakdown: +${res.createdChars} characters, +${res.createdLocs} locations, +${res.createdScenes} scenes.`
          : `Découpage appliqué : +${res.createdChars} personnages, +${res.createdLocs} décors, +${res.createdScenes} scènes.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#ECEEF2]">Scenario Studio</h1>
          <p className="text-xs text-[#8E96A4] mt-1">
            {lang === 'en'
              ? 'Import PDF, DOCX, TXT, or pasted screenplays. Original script is never altered; analyze & validate breakdown.'
              : 'Importation PDF, DOCX, TXT ou texte collé. Le texte source n’est jamais altéré ; analysez puis validez le découpage.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.fountain,.md"
            onChange={handleUpload}
            className="hidden"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 text-xs bg-[#131519] border border-[#262A33] text-[#ECEEF2] hover:border-[#C9A66B] rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <FileUp className="w-3.5 h-3.5 text-[#C9A66B]" />
            {lang === 'en' ? 'Import PDF / DOCX / TXT' : 'Importer PDF / DOCX / TXT'}
          </button>
          <button
            type="button"
            onClick={() => setShowPaste((v) => !v)}
            className="px-4 py-2 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <FileText className="w-4 h-4" />
            {lang === 'en' ? 'Paste Screenplay' : 'Coller un scénario'}
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 bg-[#122019] border border-[#1E4631] rounded-md text-xs text-[#6EE7B7]">
          {statusMsg}
        </div>
      )}
      {error && (
        <div className="p-3 bg-[#2A1417] border border-[#7F1D1D] rounded-md text-xs text-[#FCA5A5]">
          {error}
        </div>
      )}

      {showPaste && (
        <form
          onSubmit={handlePasteSubmit}
          className="p-6 bg-[#131519] border border-[#262A33] rounded-lg space-y-4"
        >
          <div>
            <label className="block text-xs text-[#8E96A4] mb-1">
              {lang === 'en' ? 'Screenplay Title' : 'Titre du scénario'}
            </label>
            <input
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
              placeholder="ex. Version 1 — Scénario de tournage"
              className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#8E96A4] mb-1">
              {lang === 'en' ? 'Screenplay Text *' : 'Texte du scénario *'}
            </label>
            <textarea
              required
              rows={8}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="INT. CAFÉ DU PORT — NUIT&#10;&#10;La pluie frappe les vitres embuées. CLAIRE (34 ans) fixe une enveloppe kraft posée devant elle..."
              className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3.5 py-2.5 text-xs font-mono text-[#ECEEF2] leading-relaxed"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowPaste(false)}
              className="px-4 py-2 text-xs text-[#A6AEBC]"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md"
            >
              {t(lang, 'save')}
            </button>
          </div>
        </form>
      )}

      {screenplays.length === 0 ? (
        <div className="p-8 bg-[#131519] border border-[#262A33] rounded-md text-center space-y-2">
          <FileText className="w-7 h-7 text-[#565E6E] mx-auto" />
          <p className="text-sm text-[#A6AEBC]">
            {lang === 'en'
              ? 'No screenplay imported yet.'
              : 'Aucun scénario importé dans ce projet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* List */}
          <div className="lg:col-span-3 space-y-2">
            {screenplays.map((sp) => (
              <button
                key={sp.id}
                type="button"
                onClick={() => {
                  setSelectedId(sp.id);
                  setWorkingDraft(null);
                }}
                className={`w-full p-3.5 rounded-md border text-left transition-colors ${
                  selected?.id === sp.id
                    ? 'bg-[#1B1E24] border-[#C9A66B]'
                    : 'bg-[#131519] border-[#262A33] hover:border-[#3A404F]'
                }`}
              >
                <div className="text-sm font-medium text-[#ECEEF2] truncate">{sp.title}</div>
                <div className="text-xs text-[#7D8594] font-mono mt-1">
                  {sp.sourceFormat.toUpperCase()} · {sp.analysis ? 'Analysé' : 'Non analysé'}
                </div>
              </button>
            ))}
          </div>

          {/* Detail Workspace */}
          {selected && (
            <div className="lg:col-span-9 bg-[#131519] border border-[#262A33] rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#262A33] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center bg-[#0B0C0E] border border-[#262A33] rounded-md p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewTab('working')}
                    className={`px-3 py-1.5 text-xs rounded ${
                      viewTab === 'working'
                        ? 'bg-[#262A33] text-[#ECEEF2]'
                        : 'text-[#8E96A4] hover:text-[#ECEEF2]'
                    }`}
                  >
                    {lang === 'en' ? 'Working Copy' : 'Version de travail'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewTab('original')}
                    className={`px-3 py-1.5 text-xs rounded inline-flex items-center gap-1 ${
                      viewTab === 'original'
                        ? 'bg-[#262A33] text-[#ECEEF2]'
                        : 'text-[#8E96A4] hover:text-[#ECEEF2]'
                    }`}
                  >
                    <Lock className="w-3 h-3" />
                    {lang === 'en' ? 'Original Source' : 'Document original'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewTab('analysis')}
                    className={`px-3 py-1.5 text-xs rounded ${
                      viewTab === 'analysis'
                        ? 'bg-[#262A33] text-[#ECEEF2]'
                        : 'text-[#8E96A4] hover:text-[#ECEEF2]'
                    }`}
                  >
                    {lang === 'en' ? 'AI Breakdown' : 'Analyse & Découpage IA'}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleAnalyze}
                    className="px-3.5 py-1.5 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {t(lang, 'aiAnalyzeScreenplay')}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await api.deleteScreenplay(selected.id);
                      setSelectedId(null);
                      await onRefresh();
                    }}
                    className="p-1.5 text-[#7D8594] hover:text-[#F87171]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-5">
                {viewTab === 'working' && (
                  <div className="space-y-3">
                    <textarea
                      rows={18}
                      value={workingDraft ?? selected.workingText}
                      onChange={(e) => setWorkingDraft(e.target.value)}
                      className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md p-4 text-xs font-mono text-[#ECEEF2] leading-relaxed focus:outline-none focus:border-[#C9A66B]"
                    />
                    {workingDraft !== null && (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setWorkingDraft(null)}
                          className="px-3 py-1.5 text-xs text-[#A6AEBC]"
                        >
                          {t(lang, 'cancel')}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={handleSaveWorkingCopy}
                          className="px-4 py-1.5 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md"
                        >
                          {t(lang, 'save')}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {viewTab === 'original' && (
                  <div className="space-y-3">
                    <p className="text-xs text-[#8E96A4] flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-[#C9A66B]" />
                      {lang === 'en'
                        ? 'Read-only archived original screenplay. CineStudio AI never alters this document.'
                        : 'Document source archivé en lecture seule. CineStudio AI ne modifie jamais ce texte.'}
                    </p>
                    <pre className="w-full max-h-[520px] overflow-y-auto bg-[#0B0C0E] border border-[#262A33] rounded-md p-4 text-xs font-mono text-[#C6CDD8] whitespace-pre-wrap leading-relaxed">
                      {selected.originalText}
                    </pre>
                  </div>
                )}

                {viewTab === 'analysis' && (
                  <div className="space-y-5">
                    {!selected.analysis ? (
                      <div className="p-8 text-center text-xs text-[#8E96A4]">
                        {lang === 'en'
                          ? 'Run Gemini analysis to detect characters, locations, emotions, and proposed scenes.'
                          : 'Lancez l’analyse Gemini pour extraire personnages, lieux, émotions et propositions de scènes.'}
                      </div>
                    ) : (
                      <>
                        <div className="p-4 bg-[#0B0C0E] border border-[#262A33] rounded-md">
                          <div className="text-xs text-[#C9A66B] font-medium mb-1">
                            {lang === 'en' ? 'Dramatic Summary' : 'Synthèse dramatique'}
                          </div>
                          <p className="text-xs text-[#C6CDD8] leading-relaxed">
                            {selected.analysis.summary}
                          </p>
                        </div>

                        {/* Validation & Selective Import Bar */}
                        <div className="p-4 bg-[#171A21] border border-[#C9A66B]/40 rounded-md flex flex-wrap items-center justify-between gap-4">
                          <div className="flex flex-wrap items-center gap-4 text-xs text-[#ECEEF2]">
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={importChars}
                                onChange={(e) => setImportChars(e.target.checked)}
                              />
                              {t(lang, 'characters')} ({selected.analysis.detectedCharacters.length})
                            </label>
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={importLocs}
                                onChange={(e) => setImportLocs(e.target.checked)}
                              />
                              {t(lang, 'locations')} ({selected.analysis.detectedLocations.length})
                            </label>
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={importScenes}
                                onChange={(e) => setImportScenes(e.target.checked)}
                              />
                              {t(lang, 'scenes')} ({selected.analysis.proposedScenes.length})
                            </label>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={handleApplyBreakdown}
                            className="px-4 py-2 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <Check className="w-3.5 h-3.5" />
                            {t(lang, 'aiProposeScenes')}
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-4 bg-[#0B0C0E] border border-[#262A33] rounded-md space-y-2">
                            <h3 className="text-xs font-semibold text-[#ECEEF2]">
                              {lang === 'en' ? 'Detected Characters' : 'Personnages identifiés'}
                            </h3>
                            <div className="space-y-2">
                              {selected.analysis.detectedCharacters.map((c, i) => (
                                <div key={i} className="text-xs border-b border-[#262A33]/60 pb-2 last:border-0">
                                  <span className="font-medium text-[#ECEEF2]">{c.name}</span>
                                  <span className="text-[#8E96A4]"> · {c.role}</span>
                                  <p className="text-[#9CA3B2] mt-0.5">{c.description}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="p-4 bg-[#0B0C0E] border border-[#262A33] rounded-md space-y-2">
                            <h3 className="text-xs font-semibold text-[#ECEEF2]">
                              {lang === 'en' ? 'Detected Locations' : 'Lieux & Décors identifiés'}
                            </h3>
                            <div className="space-y-2">
                              {selected.analysis.detectedLocations.map((l, i) => (
                                <div key={i} className="text-xs border-b border-[#262A33]/60 pb-2 last:border-0">
                                  <span className="font-medium text-[#ECEEF2]">{l.name}</span>
                                  <span className="text-[#8E96A4]"> · {l.lighting}</span>
                                  <p className="text-[#9CA3B2] mt-0.5">{l.description}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <h3 className="text-xs font-semibold text-[#ECEEF2]">
                            {lang === 'en' ? 'Proposed Scene Breakdown' : 'Découpage en scènes proposé'}
                          </h3>
                          <div className="space-y-2.5">
                            {selected.analysis.proposedScenes.map((sc, idx) => (
                              <div
                                key={idx}
                                className="p-3.5 bg-[#0B0C0E] border border-[#262A33] rounded-md text-xs space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-[#ECEEF2]">
                                    {idx + 1}. {sc.title}
                                  </span>
                                  <span className="text-[#8E96A4] font-mono">
                                    {sc.locationName} · {sc.timeOfDay}
                                  </span>
                                </div>
                                <p className="text-[#A6AEBC]">{sc.actions}</p>
                                <div className="text-[#7D8594]">
                                  {[sc.emotions, sc.lighting, sc.framing].filter(Boolean).join(' · ')}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
