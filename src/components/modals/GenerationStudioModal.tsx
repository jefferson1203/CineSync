import {
  AlertTriangle,
  Check,
  Copy,
  Globe,
  Layers,
  Loader2,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '../../shared/i18n.ts';
import type {
  AspectRatio,
  CostEstimate,
  GeneratedImage,
  ImageEntityType,
  ImageModelId,
  ImageResolution,
  PromptTemplate,
  StudioSettings,
} from '../../shared/types.ts';
import { api } from '../../services/api.ts';
import { StudioImage } from '../ui/StudioImage.tsx';

export interface GenerationContext {
  projectId: string;
  entityType: ImageEntityType;
  entityId?: string | null;
  characterSlug?: string | null;
  title: string;
  initialPrompt: string;
  defaultAspectRatio?: AspectRatio;
  initialReferenceIds?: string[];
  onSelectOfficial?: (image: GeneratedImage) => Promise<void> | void;
}

interface GenerationStudioModalProps {
  open: boolean;
  context: GenerationContext | null;
  settings: StudioSettings;
  projectImages: GeneratedImage[];
  onClose: () => void;
  onGenerated: (images: GeneratedImage[]) => void;
  onInspectImage?: (image: GeneratedImage) => void;
}

export function GenerationStudioModal({
  open,
  context,
  settings,
  projectImages,
  onClose,
  onGenerated,
  onInspectImage,
}: GenerationStudioModalProps) {
  const lang = settings.language;
  const [mode, setMode] = useState<'quick' | 'expert'>('quick');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [framingNote, setFramingNote] = useState('');
  const [lightingNote, setLightingNote] = useState('');
  const [compositionNote, setCompositionNote] = useState('');
  const [setNote, setSetNote] = useState('');

  const [modelId, setModelId] = useState<ImageModelId>(settings.defaultModel);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(settings.defaultAspectRatio);
  const [resolution, setResolution] = useState<ImageResolution>(settings.defaultResolution);
  const [variantCount, setVariantCount] = useState<number>(1);
  const [selectedRefIds, setSelectedRefIds] = useState<string[]>([]);

  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [confirmStep, setConfirmStep] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [selectedOfficialId, setSelectedOfficialId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !context) return;
    setTitle(context.title);
    setPrompt(context.initialPrompt);
    setAspectRatio(context.defaultAspectRatio ?? settings.defaultAspectRatio);
    setModelId(settings.defaultModel);
    setResolution(settings.defaultResolution);
    setVariantCount(1);
    setSelectedRefIds(context.initialReferenceIds ?? []);
    setFramingNote('');
    setLightingNote('');
    setCompositionNote('');
    setSetNote('');
    setConfirmStep(false);
    setError(null);
    setResults([]);
    setSelectedOfficialId(null);

    api.listPromptTemplates().then(setTemplates).catch(() => {});
  }, [open, context, settings.defaultAspectRatio, settings.defaultModel, settings.defaultResolution]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    api
      .estimateImageCost({ modelId, resolution, aspectRatio, variantCount })
      .then((est) => {
        if (active) setEstimate(est);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open, modelId, resolution, aspectRatio, variantCount]);

  if (!open || !context) return null;

  const selectedModel =
    settings.pricingTable.find((m) => m.modelId === modelId) ?? settings.pricingTable[0];

  const assembleFullPrompt = () => {
    const parts = [prompt.trim()];
    if (mode === 'expert') {
      if (framingNote.trim()) parts.push(`Framing & Camera: ${framingNote.trim()}`);
      if (compositionNote.trim()) parts.push(`Composition: ${compositionNote.trim()}`);
      if (lightingNote.trim()) parts.push(`Lighting: ${lightingNote.trim()}`);
      if (setNote.trim()) parts.push(`Set & Atmosphere: ${setNote.trim()}`);
    }
    return parts.filter(Boolean).join('\n');
  };

  const toggleReference = (id: string) => {
    setSelectedRefIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 6 ? [...prev, id] : prev
    );
  };

  const applyTemplate = (tpl: PromptTemplate) => {
    setPrompt((prev) => (prev.trim() ? `${prev.trim()}\n\n${tpl.promptBody}` : tpl.promptBody));
    if (tpl.defaultFraming && !framingNote) setFramingNote(tpl.defaultFraming);
    if (tpl.defaultLighting && !lightingNote) setLightingNote(tpl.defaultLighting);
  };

  const handleConfirmGenerate = async () => {
    const finalPrompt = assembleFullPrompt();
    if (!finalPrompt) {
      setError(lang === 'en' ? 'Prompt cannot be empty.' : 'Le prompt ne peut pas être vide.');
      return;
    }

    setGenerating(true);
    setError(null);
    try {
      const res = await api.generateImages({
        projectId: context.projectId,
        prompt: finalPrompt,
        modelId,
        aspectRatio,
        resolution,
        variantCount,
        entityType: context.entityType,
        entityId: context.entityId ?? null,
        characterSlug: context.characterSlug ?? null,
        title: title.trim() || context.title,
        referenceImageIds: selectedRefIds,
        expertParams:
          mode === 'expert'
            ? { framingNote, compositionNote, lightingNote, setNote }
            : {},
        confirmed: true,
      });

      setResults(res.images);
      setConfirmStep(false);
      onGenerated(res.images);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  const handleSetOfficial = async (img: GeneratedImage) => {
    setSelectedOfficialId(img.id);
    if (context.onSelectOfficial) {
      await context.onSelectOfficial(img);
    }
  };

  const handleCopyPrompt = () => {
    navigator.clipboard?.writeText(assembleFullPrompt()).catch(() => {});
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 1600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
      <div className="w-full max-w-5xl max-h-[92vh] bg-[#131519] border border-[#262A33] rounded-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#262A33]">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#ECEEF2]">
              {lang === 'en' ? 'Cinema Image Generation Engine' : "Moteur de génération d'images"}
            </h2>
            <p className="text-xs text-[#8E96A4] mt-0.5 flex items-center gap-2">
              <span>{context.title}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1 text-[#C9A66B]">
                <Globe className="w-3.5 h-3.5" />
                {t(lang, 'requiresInternet')}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-[#0B0C0E] border border-[#262A33] rounded-md p-0.5">
              <button
                type="button"
                onClick={() => setMode('quick')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  mode === 'quick'
                    ? 'bg-[#262A33] text-[#ECEEF2]'
                    : 'text-[#8E96A4] hover:text-[#ECEEF2]'
                }`}
              >
                {t(lang, 'quickMode')}
              </button>
              <button
                type="button"
                onClick={() => setMode('expert')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
                  mode === 'expert'
                    ? 'bg-[#262A33] text-[#ECEEF2]'
                    : 'text-[#8E96A4] hover:text-[#ECEEF2]'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {t(lang, 'expertMode')}
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-[#8E96A4] hover:text-[#ECEEF2] rounded-md hover:bg-[#1B1E24]"
              aria-label={t(lang, 'close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 bg-[#2A1417] border border-[#7F1D1D] rounded-md text-sm text-[#FCA5A5] flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{lang === 'en' ? 'Generation Error' : 'Erreur de génération'}</p>
                <p className="text-xs mt-1 opacity-90">{error}</p>
              </div>
            </div>
          )}

          {/* Mandatory Cost Confirmation Step */}
          {confirmStep && estimate ? (
            <div className="p-6 bg-[#171A21] border border-[#C9A66B]/40 rounded-lg space-y-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[#C9A66B] shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-display text-base font-semibold text-[#ECEEF2]">
                    {t(lang, 'costConfirmationTitle')}
                  </h3>
                  <p className="text-sm text-[#A6AEBC] mt-1">{t(lang, 'costConfirmationWarn')}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 border-y border-[#262A33] text-sm">
                <div>
                  <div className="text-xs text-[#8E96A4]">{lang === 'en' ? 'Model' : 'Modèle'}</div>
                  <div className="font-mono text-[#ECEEF2] mt-1">{estimate.modelId}</div>
                </div>
                <div>
                  <div className="text-xs text-[#8E96A4]">
                    {lang === 'en' ? 'Resolution & Format' : 'Résolution & Format'}
                  </div>
                  <div className="font-mono tabular-nums text-[#ECEEF2] mt-1">
                    {estimate.resolution} · {estimate.aspectRatio}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#8E96A4]">
                    {lang === 'en' ? 'Image Count' : "Nombre d'images"}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={variantCount}
                      onChange={(e) =>
                        setVariantCount(Math.max(1, Math.min(8, Number(e.target.value) || 1)))
                      }
                      className="w-16 bg-[#0B0C0E] border border-[#2F3542] rounded px-2 py-1 font-mono tabular-nums text-sm text-[#ECEEF2]"
                    />
                    <span className="text-xs text-[#8E96A4]">(1–8)</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#8E96A4]">
                    {lang === 'en' ? 'Estimated Total' : 'Coût total estimé'}
                  </div>
                  <div className="font-mono tabular-nums text-lg font-semibold text-[#C9A66B] mt-0.5">
                    {estimate.displayCurrency === 'EUR' ? '€' : '$'}
                    {estimate.totalCostDisplay.toFixed(3)}{' '}
                    <span className="text-xs font-normal text-[#8E96A4]">
                      ({estimate.displayCurrency === 'EUR' ? '€' : '$'}
                      {estimate.unitCostDisplay.toFixed(3)} / img)
                    </span>
                  </div>
                </div>
              </div>

              {estimate.aspectRatioNote && (
                <p className="text-xs text-[#D1A96A]">{estimate.aspectRatioNote}</p>
              )}
              <p className="text-xs text-[#8E96A4]">
                {estimate.additionalCostsNote} ({lang === 'en' ? 'Pricing updated' : 'Tarifs mis à jour'} :{' '}
                {estimate.pricingUpdatedAt})
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => setConfirmStep(false)}
                  className="px-4 py-2 text-sm text-[#A6AEBC] hover:text-[#ECEEF2] border border-[#262A33] rounded-md"
                >
                  {lang === 'en' ? 'Back & Edit' : 'Modifier les paramètres'}
                </button>
                <button
                  type="button"
                  disabled={generating}
                  onClick={handleConfirmGenerate}
                  className="px-5 py-2 text-sm font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] disabled:opacity-60 inline-flex items-center gap-2 whitespace-nowrap"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {lang === 'en' ? 'Generating with Gemini...' : 'Génération Gemini en cours...'}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      {t(lang, 'confirmAndGenerate')}
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Prompt & Templates */}
              <div className="lg:col-span-7 space-y-4">
                <div>
                  <label className="block text-xs text-[#8E96A4] mb-1.5">
                    {lang === 'en' ? 'Asset Title' : 'Titre du visuel'}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-sm text-[#ECEEF2] focus:outline-none focus:border-[#C9A66B]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-[#8E96A4]">
                      {lang === 'en' ? 'Main Cinematic Prompt' : 'Prompt cinématographique principal'}
                    </label>
                    <button
                      type="button"
                      onClick={handleCopyPrompt}
                      className="text-xs text-[#8E96A4] hover:text-[#ECEEF2] inline-flex items-center gap-1"
                    >
                      {copiedPrompt ? <Check className="w-3.5 h-3.5 text-[#34D399]" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedPrompt ? t(lang, 'copied') : t(lang, 'copyPrompt')}
                    </button>
                  </div>
                  <textarea
                    rows={mode === 'expert' ? 5 : 6}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2.5 text-sm text-[#ECEEF2] leading-relaxed focus:outline-none focus:border-[#C9A66B]"
                    placeholder={
                      lang === 'en'
                        ? 'Describe subject, wardrobe, lighting, camera framing, lens, and natural atmosphere...'
                        : 'Décrivez le sujet, la lumière, le cadrage, l’objectif et l’ambiance cinématographique...'
                    }
                  />
                </div>

                {mode === 'expert' && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs text-[#8E96A4] mb-1">
                        {lang === 'en' ? 'Framing & Lens' : 'Cadrage & Optique'}
                      </label>
                      <input
                        type="text"
                        value={framingNote}
                        onChange={(e) => setFramingNote(e.target.value)}
                        placeholder="ex. Plan rapproché, 50mm f/2.0"
                        className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#8E96A4] mb-1">
                        {lang === 'en' ? 'Composition' : 'Composition'}
                      </label>
                      <input
                        type="text"
                        value={compositionNote}
                        onChange={(e) => setCompositionNote(e.target.value)}
                        placeholder="ex. Règle des tiers, amorce floue"
                        className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#8E96A4] mb-1">
                        {lang === 'en' ? 'Lighting' : 'Éclairage'}
                      </label>
                      <input
                        type="text"
                        value={lightingNote}
                        onChange={(e) => setLightingNote(e.target.value)}
                        placeholder="ex. Contre-jour tungstène, ombres douces"
                        className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#8E96A4] mb-1">
                        {lang === 'en' ? 'Set & Color Grade' : 'Décor & Colorimétrie'}
                      </label>
                      <input
                        type="text"
                        value={setNote}
                        onChange={(e) => setSetNote(e.target.value)}
                        placeholder="ex. Palette anthracite & ambre 35mm"
                        className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
                      />
                    </div>
                  </div>
                )}

                {/* Reusable Prompt Templates */}
                {templates.length > 0 && (
                  <div className="pt-2 border-t border-[#262A33]">
                    <div className="text-xs text-[#8E96A4] mb-2">
                      {lang === 'en' ? 'Insert reusable prompt template' : 'Insérer un modèle de prompt cinéma'}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {templates.slice(0, 6).map((tpl) => (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => applyTemplate(tpl)}
                          className="px-2.5 py-1.5 text-xs bg-[#0B0C0E] border border-[#262A33] text-[#C6CDD8] hover:border-[#C9A66B] hover:text-[#ECEEF2] rounded transition-colors"
                        >
                          + {tpl.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Model, Format, Resolution, Variants & Visual References */}
              <div className="lg:col-span-5 space-y-4">
                <div>
                  <label className="block text-xs text-[#8E96A4] mb-1.5">
                    {lang === 'en' ? 'Google Gemini Image Model' : 'Modèle Google Gemini'}
                  </label>
                  <select
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value as ImageModelId)}
                    className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-sm text-[#ECEEF2]"
                  >
                    {settings.pricingTable.map((m) => (
                      <option key={m.modelId} value={m.modelId}>
                        {m.label} ({m.modelId})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-[#7D8594] mt-1">
                    {lang === 'en' ? selectedModel.descriptionEn : selectedModel.descriptionFr}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-[#8E96A4] mb-1.5">Format</label>
                    <select
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                      className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-2.5 py-2 text-sm font-mono text-[#ECEEF2]"
                    >
                      <option value="16:9">16:9</option>
                      <option value="9:16">9:16</option>
                      <option value="1:1">1:1</option>
                      <option value="4:5">4:5</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#8E96A4] mb-1.5">
                      {lang === 'en' ? 'Resolution' : 'Résolution'}
                    </label>
                    <select
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value as ImageResolution)}
                      className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-2.5 py-2 text-sm font-mono text-[#ECEEF2]"
                    >
                      {selectedModel.supportedResolutions.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#8E96A4] mb-1.5">
                      {lang === 'en' ? 'Variants' : 'Variantes'}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={variantCount}
                      onChange={(e) =>
                        setVariantCount(Math.max(1, Math.min(8, Number(e.target.value) || 1)))
                      }
                      className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-2.5 py-2 text-sm font-mono tabular-nums text-[#ECEEF2]"
                    />
                  </div>
                </div>

                {/* Visual Reference Images Picker (Character Identity Lock & Set Continuity) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-[#8E96A4] inline-flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />
                      {lang === 'en'
                        ? `Visual References (${selectedRefIds.length}/6)`
                        : `Références visuelles (${selectedRefIds.length}/6)`}
                    </label>
                    {selectedRefIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedRefIds([])}
                        className="text-xs text-[#8E96A4] hover:text-[#ECEEF2]"
                      >
                        {lang === 'en' ? 'Clear' : 'Effacer'}
                      </button>
                    )}
                  </div>
                  {projectImages.length === 0 ? (
                    <div className="p-3 bg-[#0B0C0E] border border-[#262A33] rounded-md text-xs text-[#6E7685]">
                      {lang === 'en'
                        ? 'No reference images saved in this project yet.'
                        : 'Aucune image de référence enregistrée dans ce projet pour le moment.'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 max-h-36 overflow-y-auto p-2 bg-[#0B0C0E] border border-[#262A33] rounded-md">
                      {projectImages.map((img) => {
                        const active = selectedRefIds.includes(img.id);
                        return (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => toggleReference(img.id)}
                            title={img.title}
                            className={`relative aspect-square rounded overflow-hidden border transition-colors ${
                              active ? 'border-[#C9A66B] ring-1 ring-[#C9A66B]' : 'border-[#262A33] opacity-75 hover:opacity-100'
                            }`}
                          >
                            <StudioImage
                              src={img.officialVersion?.url}
                              alt={img.title}
                              className="w-full h-full object-cover"
                            />
                            {active && (
                              <span className="absolute top-1 right-1 w-4 h-4 bg-[#C9A66B] text-[#0B0C0E] rounded-full flex items-center justify-center">
                                <Check className="w-3 h-3" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Live Cost Preview Bar */}
                {estimate && (
                  <div className="p-3.5 bg-[#0B0C0E] border border-[#262A33] rounded-md flex items-center justify-between">
                    <div className="text-xs text-[#8E96A4]">
                      <div>{lang === 'en' ? 'Estimated Cost' : 'Estimation avant validation'}</div>
                      <div className="font-mono tabular-nums text-[#A6AEBC] mt-0.5">
                        {estimate.variantCount} × {estimate.resolution} · {estimate.modelId}
                      </div>
                    </div>
                    <div className="font-mono tabular-nums text-base font-semibold text-[#C9A66B]">
                      {estimate.displayCurrency === 'EUR' ? '€' : '$'}
                      {estimate.totalCostDisplay.toFixed(3)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Generated Variants Comparison Grid */}
          {results.length > 0 && (
            <div className="pt-4 border-t border-[#262A33] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold text-[#ECEEF2]">
                  {lang === 'en'
                    ? `Generated Results (${results.length})`
                    : `Propositions générées (${results.length})`}
                </h3>
                <span className="text-xs text-[#8E96A4]">
                  {lang === 'en'
                    ? 'Saved automatically to project folder & SQLite'
                    : 'Enregistrées automatiquement sur disque et SQLite'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {results.map((img) => {
                  const isOfficial = selectedOfficialId === img.id;
                  return (
                    <div
                      key={img.id}
                      className={`bg-[#0B0C0E] border rounded-md overflow-hidden ${
                        isOfficial ? 'border-[#C9A66B]' : 'border-[#262A33]'
                      }`}
                    >
                      <div className="aspect-video bg-[#121419] overflow-hidden">
                        <StudioImage
                          src={img.officialVersion?.url}
                          alt={img.title}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="p-3 flex items-center justify-between gap-2">
                        <span className="text-xs text-[#C6CDD8] truncate">{img.title}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {context.onSelectOfficial && (
                            <button
                              type="button"
                              onClick={() => handleSetOfficial(img)}
                              className={`px-2.5 py-1 text-xs rounded whitespace-nowrap ${
                                isOfficial
                                  ? 'bg-[#C9A66B] text-[#0B0C0E] font-medium'
                                  : 'bg-[#1B1E24] text-[#ECEEF2] hover:bg-[#262A33]'
                              }`}
                            >
                              {isOfficial ? t(lang, 'officialImage') : t(lang, 'setOfficial')}
                            </button>
                          )}
                          {onInspectImage && (
                            <button
                              type="button"
                              onClick={() => onInspectImage(img)}
                              className="px-2.5 py-1 text-xs bg-[#1B1E24] text-[#A6AEBC] hover:text-[#ECEEF2] rounded"
                            >
                              {t(lang, 'retouch')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!confirmStep && (
          <div className="px-6 py-4 border-t border-[#262A33] flex items-center justify-between bg-[#0F1115]">
            <p className="text-xs text-[#8E96A4]">
              {lang === 'en'
                ? 'Photorealistic 35mm cinema realism is enforced automatically.'
                : 'Direction artistique photoréaliste cinéma 35mm appliquée automatiquement.'}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-[#A6AEBC] hover:text-[#ECEEF2]"
              >
                {t(lang, 'close')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setConfirmStep(true);
                }}
                className="px-5 py-2 text-sm font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] inline-flex items-center gap-2 whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4" />
                {lang === 'en' ? 'Review Cost & Generate' : 'Vérifier le coût et générer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
