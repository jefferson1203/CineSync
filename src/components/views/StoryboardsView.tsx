import {
  ArrowDown,
  ArrowUp,
  Check,
  Clapperboard,
  Copy,
  FileDown,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { FRAMING_LABELS, t } from '../../shared/i18n.ts';
import type {
  CameraFraming,
  Character,
  GeneratedImage,
  LocationItem,
  Outfit,
  Project,
  SceneItem,
  StoryboardShot,
  StudioSettings,
} from '../../shared/types.ts';
import { api } from '../../services/api.ts';
import type { GenerationContext } from '../modals/GenerationStudioModal.tsx';
import { StudioImage } from '../ui/StudioImage.tsx';

interface StoryboardsViewProps {
  settings: StudioSettings;
  project: Project | null;
  scenes: SceneItem[];
  shots: StoryboardShot[];
  characters: Character[];
  outfits: Outfit[];
  locations: LocationItem[];
  images: GeneratedImage[];
  initialSceneId?: string | null;
  onRefresh: () => Promise<void>;
  onOpenGenerate: (ctx: GenerationContext) => void;
  onInspectImage: (image: GeneratedImage) => void;
}

export function StoryboardsView({
  settings,
  project,
  scenes,
  shots,
  characters,
  outfits,
  locations,
  images,
  initialSceneId,
  onRefresh,
  onOpenGenerate,
  onInspectImage,
}: StoryboardsViewProps) {
  const lang = settings.language;
  const [selectedSceneId, setSelectedSceneId] = useState<string>(
    initialSceneId || scenes[0]?.id || ''
  );
  const [desiredCount, setDesiredCount] = useState<string>('');
  const [proposedShots, setProposedShots] = useState<Array<Partial<StoryboardShot>>>([]);
  const [editingShot, setEditingShot] = useState<StoryboardShot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialSceneId && scenes.some((s) => s.id === initialSceneId)) {
      setSelectedSceneId(initialSceneId);
    } else if (!selectedSceneId && scenes[0]) {
      setSelectedSceneId(scenes[0].id);
    }
  }, [initialSceneId, scenes, selectedSceneId]);

  if (!project) {
    return (
      <div className="p-8 bg-[#131519] border border-[#262A33] rounded-md text-sm text-[#8E96A4]">
        {t(lang, 'emptyProjectPrompt')}
      </div>
    );
  }

  const activeScene = scenes.find((s) => s.id === selectedSceneId) ?? scenes[0] ?? null;
  const sceneShots = activeScene
    ? shots.filter((sh) => sh.sceneId === activeScene.id).sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  const handleProposeShots = async () => {
    if (!activeScene) return;
    setBusy(true);
    setError(null);
    try {
      const count = desiredCount ? Number(desiredCount) : undefined;
      const res = await api.proposeStoryboard(activeScene.id, count);
      setProposedShots(res.proposedShots);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmProposedShots = async () => {
    if (!activeScene || proposedShots.length === 0) return;
    setBusy(true);
    try {
      for (const ps of proposedShots) {
        await api.createShot(project.id, {
          ...ps,
          sceneId: activeScene.id,
          visibleCharacterIds: activeScene.characterIds,
          locationId: activeScene.locationId,
        });
      }
      setProposedShots([]);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handleAddEmptyShot = async () => {
    if (!activeScene) return;
    await api.createShot(project.id, {
      sceneId: activeScene.id,
      actionDescription: activeScene.actions || 'Action du plan',
      visibleCharacterIds: activeScene.characterIds,
      locationId: activeScene.locationId,
      framing: 'medium_shot',
      cameraAngle: 'Niveau des yeux',
      lighting: activeScene.lighting || 'Lumière naturelle cinématographique',
      ambiance: activeScene.ambiance || '',
      durationSec: 4,
      prompt: `${activeScene.title} — ${activeScene.locationName}, ${activeScene.timeOfDay}. ${activeScene.actions}`,
    });
    await onRefresh();
  };

  const handleMoveShot = async (index: number, delta: -1 | 1) => {
    if (!activeScene) return;
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= sceneShots.length) return;
    const ids = sceneShots.map((s) => s.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(targetIdx, 0, moved);
    await api.reorderShots(activeScene.id, ids);
    await onRefresh();
  };

  const launchShotGeneration = (shot: StoryboardShot) => {
    if (!activeScene) return;
    // Automatically gather official visual references from locked characters, outfits, and location!
    const refIds: string[] = [];
    const visibleChars = characters.filter((c) =>
      (shot.visibleCharacterIds.length > 0 ? shot.visibleCharacterIds : activeScene.characterIds).includes(
        c.id
      )
    );
    for (const c of visibleChars) {
      if (c.officialReferenceIds.length > 0) {
        refIds.push(c.officialReferenceIds[0]);
      }
      const outfitId = activeScene.outfitAssignments[c.id];
      const outfit = outfits.find((o) => o.id === outfitId);
      if (outfit?.referenceImageId) {
        refIds.push(outfit.referenceImageId);
      }
    }
    const loc = locations.find((l) => l.id === (shot.locationId ?? activeScene.locationId));
    if (loc?.primaryImageId) {
      refIds.push(loc.primaryImageId);
    } else if (loc?.referenceImageIds[0]) {
      refIds.push(loc.referenceImageIds[0]);
    }

    const framingText = FRAMING_LABELS.en[shot.framing] ?? shot.framing;
    const basePrompt =
      shot.prompt?.trim() ||
      `${framingText}, ${shot.cameraAngle}. ${shot.actionDescription}. Expression: ${shot.expression}. Pose: ${shot.pose}. Wardrobe: ${shot.outfitNotes}. Location: ${
        loc?.name ?? activeScene.locationName
      }. Lighting: ${shot.lighting}. Ambiance: ${shot.ambiance}.`;

    onOpenGenerate({
      projectId: project.id,
      entityType: 'storyboard_shot',
      entityId: shot.id,
      title: `${activeScene.title} — Plan #${String(shot.shotNumber).padStart(2, '0')}`,
      initialPrompt: basePrompt,
      defaultAspectRatio: project.aspectRatio,
      initialReferenceIds: Array.from(new Set(refIds)).slice(0, 6),
      onSelectOfficial: async (img) => {
        await api.updateShot(shot.id, { officialImageId: img.id });
        await onRefresh();
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#ECEEF2]">
            Storyboard Studio
          </h1>
          <p className="text-xs text-[#8E96A4] mt-1">
            {lang === 'en'
              ? 'Automatic AI shot breakdown, visual continuity with locked character & location references, and PDF export.'
              : 'Découpage automatique en plans, continuité visuelle via références verrouillées et export PDF professionnel.'}
          </p>
        </div>

        {activeScene && (
          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={`/api/projects/${encodeURIComponent(project.id)}/storyboard-pdf?sceneId=${encodeURIComponent(
                activeScene.id
              )}`}
              className="px-3.5 py-2 text-xs bg-[#131519] border border-[#262A33] text-[#ECEEF2] hover:border-[#C9A66B] rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileDown className="w-3.5 h-3.5 text-[#C9A66B]" />
              {t(lang, 'exportPdf')}
            </a>
            <button
              type="button"
              onClick={handleAddEmptyShot}
              className="px-3.5 py-2 text-xs bg-[#1B1E24] border border-[#2C313C] text-[#ECEEF2] hover:bg-[#232730] rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              {lang === 'en' ? 'Add Shot' : 'Ajouter un plan'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-[#2A1417] border border-[#7F1D1D] rounded-md text-xs text-[#FCA5A5]">
          {error}
        </div>
      )}

      {scenes.length === 0 ? (
        <div className="p-8 bg-[#131519] border border-[#262A33] rounded-md text-center space-y-2">
          <Clapperboard className="w-7 h-7 text-[#565E6E] mx-auto" />
          <p className="text-sm text-[#A6AEBC]">
            {lang === 'en'
              ? 'Create a scene in Scene Studio (or Scenario Studio) to start storyboarding.'
              : 'Créez au moins une scène dans Scene Studio (ou Scenario Studio) pour démarrer le storyboard.'}
          </p>
        </div>
      ) : (
        <>
          {/* Scene Selector + AI Breakdown Controls */}
          <div className="p-4 bg-[#131519] border border-[#262A33] rounded-lg flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-[260px]">
              <label className="text-xs text-[#8E96A4] whitespace-nowrap">
                {lang === 'en' ? 'Active Scene' : 'Scène active'}
              </label>
              <select
                value={activeScene?.id ?? ''}
                onChange={(e) => {
                  setSelectedSceneId(e.target.value);
                  setProposedShots([]);
                }}
                className="flex-1 bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
              >
                {scenes.map((sc, idx) => (
                  <option key={sc.id} value={sc.id}>
                    {String(idx + 1).padStart(2, '0')} · {sc.title} ({sc.timeOfDay})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={16}
                value={desiredCount}
                onChange={(e) => setDesiredCount(e.target.value)}
                placeholder={lang === 'en' ? 'Auto shots' : 'Nb plans (auto)'}
                className="w-32 bg-[#0B0C0E] border border-[#262A33] rounded-md px-2.5 py-2 text-xs font-mono text-[#ECEEF2]"
              />
              <button
                type="button"
                disabled={busy}
                onClick={handleProposeShots}
                className="px-4 py-2 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {t(lang, 'aiProposeStoryboard')}
              </button>
            </div>
          </div>

          {/* Pending AI Proposed Shots Review Banner */}
          {proposedShots.length > 0 && (
            <div className="p-5 bg-[#171A21] border border-[#C9A66B]/40 rounded-lg space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-sm font-semibold text-[#ECEEF2]">
                    {lang === 'en'
                      ? `AI Shot Breakdown Proposal (${proposedShots.length} shots)`
                      : `Proposition de découpage IA (${proposedShots.length} plans)`}
                  </h3>
                  <p className="text-xs text-[#A6AEBC] mt-0.5">
                    {lang === 'en'
                      ? 'Review before adding these shots to the storyboard.'
                      : 'Vérifiez ce découpage avant de l’ajouter au storyboard.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setProposedShots([])}
                    className="px-3 py-1.5 text-xs text-[#A6AEBC]"
                  >
                    {t(lang, 'cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleConfirmProposedShots}
                    className="px-4 py-1.5 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md inline-flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {lang === 'en' ? 'Validate & Add Shots' : 'Valider et ajouter les plans'}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto">
                {proposedShots.map((ps, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-[#0B0C0E] border border-[#262A33] rounded text-xs space-y-1"
                  >
                    <div className="font-mono text-[#C9A66B]">
                      PLAN #{String(ps.shotNumber ?? idx + 1).padStart(2, '0')} · {ps.framing} ·{' '}
                      {ps.durationSec ?? 4}s
                    </div>
                    <p className="text-[#ECEEF2]">{ps.actionDescription}</p>
                    <p className="text-[#7D8594] truncate">{ps.cameraAngle} · {ps.lighting}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Visual Storyboard Cards Grid */}
          {sceneShots.length === 0 ? (
            <div className="p-8 bg-[#131519] border border-[#262A33] rounded-md text-center space-y-2">
              <p className="text-sm text-[#A6AEBC]">
                {lang === 'en'
                  ? 'No shots in this scene yet. Ask Gemini to propose a breakdown or add a shot manually.'
                  : 'Aucun plan dans cette scène. Demandez un découpage à Gemini ou ajoutez un plan manuellement.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {sceneShots.map((shot, idx) => {
                const officialImg = images.find((i) => i.id === shot.officialImageId);
                const shotImages = images.filter((i) => i.entityId === shot.id);
                return (
                  <div
                    key={shot.id}
                    className="bg-[#131519] border border-[#262A33] rounded-lg overflow-hidden flex flex-col"
                  >
                    {/* Visual Frame */}
                    <div className="aspect-video bg-[#0B0C0E] relative border-b border-[#262A33]">
                      {officialImg ? (
                        <button
                          type="button"
                          onClick={() => onInspectImage(officialImg)}
                          className="w-full h-full block"
                        >
                          <StudioImage
                            src={officialImg.officialVersion?.url}
                            alt={`Plan ${shot.shotNumber}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-[#6E7685]">
                          <Clapperboard className="w-7 h-7 opacity-40" />
                          <button
                            type="button"
                            onClick={() => launchShotGeneration(shot)}
                            className="px-3.5 py-1.5 text-xs bg-[#1B1E24] border border-[#C9A66B]/60 text-[#ECEEF2] rounded-md inline-flex items-center gap-1.5 hover:bg-[#232730]"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-[#C9A66B]" />
                            {lang === 'en' ? 'Generate Frame' : 'Générer ce plan'}
                          </button>
                        </div>
                      )}
                      <div className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-black/75 text-[#ECEEF2] text-[11px] font-mono tabular-nums rounded">
                        PLAN {String(shot.shotNumber).padStart(2, '0')} · {shot.durationSec}s
                      </div>
                    </div>

                    {/* Shot Technical Details */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div className="space-y-1.5">
                        <div className="text-xs text-[#C9A66B]">
                          {FRAMING_LABELS[lang][shot.framing] ?? shot.framing} · {shot.cameraAngle}
                        </div>
                        <p className="text-sm text-[#ECEEF2] leading-snug">
                          {shot.actionDescription}
                        </p>
                        <div className="text-xs text-[#8E96A4]">
                          {[shot.expression, shot.lighting, shot.ambiance].filter(Boolean).join(' · ')}
                        </div>
                      </div>

                      {/* Shot Variant Strip if multiple takes exist */}
                      {shotImages.length > 1 && (
                        <div className="flex items-center gap-2 pt-2 border-t border-[#262A33] overflow-x-auto">
                          <span className="text-[11px] text-[#7D8594] shrink-0">
                            {lang === 'en' ? 'Takes:' : 'Prises :'}
                          </span>
                          {shotImages.map((img) => (
                            <button
                              key={img.id}
                              type="button"
                              onClick={async () => {
                                await api.updateShot(shot.id, { officialImageId: img.id });
                                await onRefresh();
                              }}
                              className={`w-12 h-8 rounded overflow-hidden border shrink-0 ${
                                img.id === shot.officialImageId
                                  ? 'border-[#C9A66B]'
                                  : 'border-[#262A33] opacity-70 hover:opacity-100'
                              }`}
                            >
                              <StudioImage
                                src={img.officialVersion?.url}
                                alt={img.title}
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Shot Action Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#262A33]">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => launchShotGeneration(shot)}
                            className="px-3 py-1.5 text-xs bg-[#1B1E24] border border-[#2C313C] text-[#ECEEF2] hover:border-[#C9A66B] rounded inline-flex items-center gap-1.5"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-[#C9A66B]" />
                            {officialImg
                              ? lang === 'en'
                                ? 'New Take'
                                : 'Nouvelle prise'
                              : lang === 'en'
                                ? 'Generate'
                                : 'Générer'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingShot(shot)}
                            className="px-2.5 py-1.5 text-xs text-[#A6AEBC] hover:text-[#ECEEF2] border border-[#262A33] rounded"
                          >
                            {t(lang, 'edit')}
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveShot(idx, -1)}
                            className="p-1.5 text-[#8E96A4] hover:text-[#ECEEF2] disabled:opacity-30"
                            title="Monter"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === sceneShots.length - 1}
                            onClick={() => handleMoveShot(idx, 1)}
                            className="p-1.5 text-[#8E96A4] hover:text-[#ECEEF2] disabled:opacity-30"
                            title="Descendre"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await api.duplicateShot(shot.id);
                              await onRefresh();
                            }}
                            className="p-1.5 text-[#8E96A4] hover:text-[#ECEEF2]"
                            title={t(lang, 'duplicate')}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await api.deleteShot(shot.id);
                              await onRefresh();
                            }}
                            className="p-1.5 text-[#8E96A4] hover:text-[#F87171]"
                            title={t(lang, 'delete')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Inline Shot Editor Modal */}
      {editingShot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-2xl bg-[#131519] border border-[#262A33] rounded-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-lg font-semibold text-[#ECEEF2]">
              {lang === 'en' ? `Edit Shot #${editingShot.shotNumber}` : `Modifier le Plan #${editingShot.shotNumber}`}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#8E96A4] mb-1">
                  {lang === 'en' ? 'Framing' : 'Cadrage'}
                </label>
                <select
                  value={editingShot.framing}
                  onChange={(e) =>
                    setEditingShot({ ...editingShot, framing: e.target.value as CameraFraming })
                  }
                  className="w-full bg-[#0B0C0E] border border-[#262A33] rounded px-2.5 py-2 text-xs text-[#ECEEF2]"
                >
                  {(Object.keys(FRAMING_LABELS[lang]) as CameraFraming[]).map((f) => (
                    <option key={f} value={f}>
                      {FRAMING_LABELS[lang][f]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#8E96A4] mb-1">
                  {lang === 'en' ? 'Camera Angle' : 'Angle de caméra'}
                </label>
                <input
                  value={editingShot.cameraAngle}
                  onChange={(e) => setEditingShot({ ...editingShot, cameraAngle: e.target.value })}
                  className="w-full bg-[#0B0C0E] border border-[#262A33] rounded px-2.5 py-2 text-xs text-[#ECEEF2]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#8E96A4] mb-1">
                  {lang === 'en' ? 'Lighting' : 'Éclairage'}
                </label>
                <input
                  value={editingShot.lighting}
                  onChange={(e) => setEditingShot({ ...editingShot, lighting: e.target.value })}
                  className="w-full bg-[#0B0C0E] border border-[#262A33] rounded px-2.5 py-2 text-xs text-[#ECEEF2]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#8E96A4] mb-1">
                  {lang === 'en' ? 'Duration (sec)' : 'Durée indicative (sec)'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={editingShot.durationSec}
                  onChange={(e) =>
                    setEditingShot({ ...editingShot, durationSec: Number(e.target.value) || 4 })
                  }
                  className="w-full bg-[#0B0C0E] border border-[#262A33] rounded px-2.5 py-2 text-xs font-mono text-[#ECEEF2]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">
                {lang === 'en' ? 'Action Description' : "Description de l'action"}
              </label>
              <textarea
                rows={2}
                value={editingShot.actionDescription}
                onChange={(e) =>
                  setEditingShot({ ...editingShot, actionDescription: e.target.value })
                }
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded px-3 py-2 text-xs text-[#ECEEF2]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">
                {lang === 'en' ? 'Generation Prompt' : 'Prompt de génération'}
              </label>
              <textarea
                rows={4}
                value={editingShot.prompt}
                onChange={(e) => setEditingShot({ ...editingShot, prompt: e.target.value })}
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded px-3 py-2 text-xs font-mono text-[#ECEEF2]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingShot(null)}
                className="px-4 py-2 text-xs text-[#A6AEBC]"
              >
                {t(lang, 'cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await api.updateShot(editingShot.id, editingShot);
                  setEditingShot(null);
                  await onRefresh();
                }}
                className="px-5 py-2 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md"
              >
                {t(lang, 'save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
