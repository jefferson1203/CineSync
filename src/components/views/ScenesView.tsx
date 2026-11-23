import { Clapperboard, Layers, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { t } from '../../shared/i18n.ts';
import type {
  Character,
  LocationItem,
  Outfit,
  Project,
  SceneItem,
  StudioSettings,
} from '../../shared/types.ts';
import { api } from '../../services/api.ts';

interface ScenesViewProps {
  settings: StudioSettings;
  project: Project | null;
  scenes: SceneItem[];
  characters: Character[];
  outfits: Outfit[];
  locations: LocationItem[];
  onRefresh: () => Promise<void>;
  onOpenStoryboardForScene: (sceneId: string) => void;
}

const EMPTY_SCENE: Partial<SceneItem> = {
  title: '',
  description: '',
  locationId: null,
  locationName: '',
  timeOfDay: 'Jour',
  characterIds: [],
  outfitAssignments: {},
  actions: '',
  dialogues: '',
  emotions: '',
  ambiance: '',
  lighting: '',
  framing: '',
  visualGoal: '',
};

export function ScenesView({
  settings,
  project,
  scenes,
  characters,
  outfits,
  locations,
  onRefresh,
  onOpenStoryboardForScene,
}: ScenesViewProps) {
  const lang = settings.language;
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [freePrompt, setFreePrompt] = useState('');
  const [form, setForm] = useState<Partial<SceneItem>>(EMPTY_SCENE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!project) {
    return (
      <div className="p-8 bg-[#131519] border border-[#262A33] rounded-md text-sm text-[#8E96A4]">
        {t(lang, 'emptyProjectPrompt')}
      </div>
    );
  }

  const handlePropose = async () => {
    if (!freePrompt.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const proposal = await api.proposeScene(project.id, freePrompt.trim());
      setForm((prev) => ({ ...prev, ...proposal }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await api.updateScene(editingId, form);
      } else {
        await api.createScene(project.id, form);
      }
      setShowBuilder(false);
      setEditingId(null);
      setForm(EMPTY_SCENE);
      setFreePrompt('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleCharacter = (charId: string) => {
    const list = form.characterIds ?? [];
    setForm((prev) => ({
      ...prev,
      characterIds: list.includes(charId) ? list.filter((x) => x !== charId) : [...list, charId],
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#ECEEF2]">Scene Studio</h1>
          <p className="text-xs text-[#8E96A4] mt-1">
            {lang === 'en'
              ? 'Build scenes manually, from free descriptions (AI proposal + review), or from Scenario Studio breakdown.'
              : 'Créez vos scènes manuellement, depuis une description libre (proposition IA validée) ou depuis Scenario Studio.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setForm(EMPTY_SCENE);
            setShowBuilder((v) => !v);
          }}
          className="px-4 py-2 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          {lang === 'en' ? 'New Scene' : 'Nouvelle scène'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-[#2A1417] border border-[#7F1D1D] rounded-md text-xs text-[#FCA5A5]">
          {error}
        </div>
      )}

      {showBuilder && (
        <div className="p-6 bg-[#131519] border border-[#262A33] rounded-lg space-y-5">
          {!editingId && (
            <div className="p-4 bg-[#0B0C0E] border border-[#262A33] rounded-md space-y-2.5">
              <label className="block text-xs text-[#C9A66B] font-medium">
                {lang === 'en'
                  ? 'Optional: Describe your scene freely — Gemini prepares fields for your validation'
                  : 'Optionnel : décrivez la scène librement — Gemini pré-remplit la fiche avant votre validation'}
              </label>
              <div className="flex gap-2">
                <input
                  value={freePrompt}
                  onChange={(e) => setFreePrompt(e.target.value)}
                  placeholder="ex. Confrontation silencieuse entre Marc et Claire dans un café désert sous la pluie, fin d'après-midi..."
                  className="flex-1 bg-[#131519] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
                />
                <button
                  type="button"
                  disabled={busy || !freePrompt.trim()}
                  onClick={handlePropose}
                  className="px-4 py-2 text-xs bg-[#1B1E24] border border-[#C9A66B]/60 text-[#ECEEF2] rounded-md inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-[#C9A66B]" />
                  )}
                  {lang === 'en' ? 'Propose with AI' : 'Proposer via IA'}
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs text-[#8E96A4] mb-1">
                  {lang === 'en' ? 'Scene Title *' : 'Titre de la scène *'}
                </label>
                <input
                  required
                  value={form.title ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="ex. Scène 01 — L'enveloppe au Café du Port"
                  className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#8E96A4] mb-1">
                  {lang === 'en' ? 'Reusable Location' : 'Décor associé'}
                </label>
                <select
                  value={form.locationId ?? ''}
                  onChange={(e) => {
                    const loc = locations.find((l) => l.id === e.target.value);
                    setForm((p) => ({
                      ...p,
                      locationId: loc?.id ?? null,
                      locationName: loc?.name ?? p.locationName,
                    }));
                  }}
                  className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
                >
                  <option value="">{lang === 'en' ? '— Custom / None —' : '— Libre / Aucun —'}</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#8E96A4] mb-1">
                  {lang === 'en' ? 'Time of Day' : 'Moment de la journée'}
                </label>
                <input
                  value={form.timeOfDay ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, timeOfDay: e.target.value }))}
                  placeholder="Aube / Jour / Crépuscule / Nuit"
                  className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
                />
              </div>
            </div>

            {/* Characters & Wardrobe assignments */}
            {characters.length > 0 && (
              <div className="space-y-2">
                <label className="block text-xs text-[#8E96A4]">
                  {lang === 'en' ? 'Characters Present & Outfits' : 'Personnages présents & tenues'}
                </label>
                <div className="flex flex-wrap gap-2">
                  {characters.map((c) => {
                    const active = (form.characterIds ?? []).includes(c.id);
                    const charOutfits = outfits.filter((o) => o.characterId === c.id);
                    return (
                      <div
                        key={c.id}
                        className={`p-2 rounded border text-xs flex items-center gap-2 ${
                          active
                            ? 'bg-[#1B1E24] border-[#C9A66B] text-[#ECEEF2]'
                            : 'bg-[#0B0C0E] border-[#262A33] text-[#8E96A4]'
                        }`}
                      >
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() => toggleCharacter(c.id)}
                          />
                          {c.name}
                        </label>
                        {active && charOutfits.length > 0 && (
                          <select
                            value={form.outfitAssignments?.[c.id] ?? ''}
                            onChange={(e) =>
                              setForm((p) => ({
                                ...p,
                                outfitAssignments: {
                                  ...(p.outfitAssignments ?? {}),
                                  [c.id]: e.target.value,
                                },
                              }))
                            }
                            className="bg-[#0B0C0E] border border-[#262A33] rounded px-1.5 py-0.5 text-[11px] text-[#ECEEF2]"
                          >
                            <option value="">Tenue...</option>
                            {charOutfits.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#8E96A4] mb-1">Actions</label>
                <textarea
                  rows={2}
                  value={form.actions ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, actions: e.target.value }))}
                  className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#8E96A4] mb-1">Dialogues</label>
                <textarea
                  rows={2}
                  value={form.dialogues ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, dialogues: e.target.value }))}
                  className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-[#8E96A4] mb-1">
                  {lang === 'en' ? 'Emotions' : 'Émotions'}
                </label>
                <input
                  value={form.emotions ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, emotions: e.target.value }))}
                  className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-1.5 text-xs text-[#ECEEF2]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#8E96A4] mb-1">Ambiance</label>
                <input
                  value={form.ambiance ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, ambiance: e.target.value }))}
                  className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-1.5 text-xs text-[#ECEEF2]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#8E96A4] mb-1">
                  {lang === 'en' ? 'Lighting' : 'Éclairage'}
                </label>
                <input
                  value={form.lighting ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, lighting: e.target.value }))}
                  className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-1.5 text-xs text-[#ECEEF2]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#8E96A4] mb-1">
                  {lang === 'en' ? 'Framing Intent' : 'Cadrage général'}
                </label>
                <input
                  value={form.framing ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, framing: e.target.value }))}
                  className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-1.5 text-xs text-[#ECEEF2]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">
                {lang === 'en' ? 'Visual Goal' : 'Objectif visuel'}
              </label>
              <input
                value={form.visualGoal ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, visualGoal: e.target.value }))}
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-1.5 text-xs text-[#ECEEF2]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowBuilder(false);
                  setEditingId(null);
                }}
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
        </div>
      )}

      {scenes.length === 0 ? (
        <div className="p-8 bg-[#131519] border border-[#262A33] rounded-md text-center space-y-2">
          <Layers className="w-7 h-7 text-[#565E6E] mx-auto" />
          <p className="text-sm text-[#A6AEBC]">
            {lang === 'en' ? 'No scenes created yet.' : 'Aucune scène enregistrée.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {scenes.map((sc, idx) => {
            const loc = locations.find((l) => l.id === sc.locationId);
            const chars = characters.filter((c) => sc.characterIds.includes(c.id));
            return (
              <div
                key={sc.id}
                className="p-5 bg-[#131519] border border-[#262A33] rounded-lg flex flex-wrap items-start justify-between gap-4"
              >
                <div className="space-y-1.5 max-w-3xl">
                  <div className="text-xs text-[#8E96A4] font-mono tabular-nums">
                    SCÈNE {String(idx + 1).padStart(2, '0')} · {loc?.name || sc.locationName || '—'} ·{' '}
                    {sc.timeOfDay}
                  </div>
                  <h3 className="font-display text-base font-semibold text-[#ECEEF2]">{sc.title}</h3>
                  {sc.actions && <p className="text-xs text-[#C6CDD8] leading-relaxed">{sc.actions}</p>}
                  <div className="text-xs text-[#7D8594]">
                    {[
                      chars.length > 0 ? chars.map((c) => c.name).join(', ') : null,
                      sc.emotions,
                      sc.lighting,
                      sc.visualGoal,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenStoryboardForScene(sc.id)}
                    className="px-3.5 py-2 text-xs font-medium bg-[#1B1E24] border border-[#C9A66B]/60 text-[#ECEEF2] hover:bg-[#232730] rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Clapperboard className="w-3.5 h-3.5 text-[#C9A66B]" />
                    Storyboard
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(sc.id);
                      setForm(sc);
                      setShowBuilder(true);
                    }}
                    className="px-3 py-2 text-xs text-[#A6AEBC] hover:text-[#ECEEF2] border border-[#262A33] rounded-md"
                  >
                    {t(lang, 'edit')}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await api.deleteScene(sc.id);
                      await onRefresh();
                    }}
                    className="p-2 text-[#7D8594] hover:text-[#F87171]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
