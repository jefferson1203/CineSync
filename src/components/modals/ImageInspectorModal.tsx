import {
  AlertTriangle,
  Check,
  Columns2,
  Copy,
  Crop,
  Download,
  History,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { t } from '../../shared/i18n.ts';
import type {
  CostEstimate,
  GeneratedImage,
  ImageModelId,
  ImageResolution,
  ImageVersion,
  StudioSettings,
} from '../../shared/types.ts';
import { api } from '../../services/api.ts';
import { StudioImage } from '../ui/StudioImage.tsx';

interface ImageInspectorModalProps {
  image: GeneratedImage | null;
  settings: StudioSettings;
  onClose: () => void;
  onImageUpdated: (updated: GeneratedImage | null) => void;
}

interface BoxSelection {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}

export function ImageInspectorModal({
  image,
  settings,
  onClose,
  onImageUpdated,
}: ImageInspectorModalProps) {
  const lang = settings.language;
  const [current, setCurrent] = useState<GeneratedImage | null>(image);
  const [selectedVerId, setSelectedVerId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVerId, setCompareVerId] = useState<string | null>(null);

  // Conversational & regional retouch state
  const [editInstruction, setEditInstruction] = useState('');
  const [editModelId, setEditModelId] = useState<ImageModelId>(settings.defaultModel);
  const [editResolution, setEditResolution] = useState<ImageResolution>(settings.defaultResolution);
  const [selectRegionMode, setSelectRegionMode] = useState(false);
  const [regionBox, setRegionBox] = useState<BoxSelection | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [confirmEdit, setConfirmEdit] = useState(false);
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCurrent(image);
    if (image) {
      setSelectedVerId(image.officialVersionId ?? image.versions?.[0]?.id ?? null);
      setCompareVerId(image.versions?.[1]?.id ?? image.versions?.[0]?.id ?? null);
      setCompareMode(false);
      setSelectRegionMode(false);
      setRegionBox(null);
      setEditInstruction('');
      setConfirmEdit(false);
      setError(null);
      setNotice(null);
    }
  }, [image]);

  useEffect(() => {
    if (!current) return;
    const activeVer = current.versions?.find((v) => v.id === selectedVerId) ?? current.officialVersion;
    if (!activeVer) return;
    api
      .estimateImageCost({
        modelId: editModelId,
        resolution: editResolution,
        aspectRatio: activeVer.aspectRatio,
        variantCount: 1,
      })
      .then(setEstimate)
      .catch(() => {});
  }, [current, selectedVerId, editModelId, editResolution]);

  if (!current) return null;

  const versions = current.versions ?? [];
  const activeVersion: ImageVersion | null =
    versions.find((v) => v.id === selectedVerId) ?? current.officialVersion ?? versions[0] ?? null;
  const compareVersion: ImageVersion | null =
    versions.find((v) => v.id === compareVerId) ?? versions[versions.length - 1] ?? null;

  const handleStageMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectRegionMode || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setDragStart({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
    setRegionBox({ xPct: x, yPct: y, widthPct: 0, heightPct: 0 });
  };

  const handleStageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragStart || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setRegionBox({
      xPct: Math.min(dragStart.x, x),
      yPct: Math.min(dragStart.y, y),
      widthPct: Math.abs(x - dragStart.x),
      heightPct: Math.abs(y - dragStart.y),
    });
  };

  const handleStageMouseUp = () => {
    setDragStart(null);
    if (regionBox && (regionBox.widthPct < 3 || regionBox.heightPct < 3)) {
      setRegionBox(null);
    }
  };

  const handleConfirmRetouch = async () => {
    if (!activeVersion || !editInstruction.trim()) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.editImage(current.id, {
        instruction: editInstruction.trim(),
        baseVersionId: activeVersion.id,
        modelId: editModelId,
        resolution: editResolution,
        region: regionBox,
        confirmed: true,
      });
      setCurrent(res.image);
      setSelectedVerId(res.image.officialVersionId);
      setEditInstruction('');
      setRegionBox(null);
      setSelectRegionMode(false);
      setConfirmEdit(false);
      if (res.limitationNotice) setNotice(res.limitationNotice);
      onImageUpdated(res.image);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestore = async (ver: ImageVersion) => {
    setError(null);
    try {
      const updated = await api.restoreImageVersion(current.id, ver.id);
      setCurrent(updated);
      setSelectedVerId(updated.officialVersionId);
      onImageUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDuplicate = async (ver: ImageVersion) => {
    setError(null);
    try {
      const updated = await api.duplicateImageVersion(current.id, ver.id);
      setCurrent(updated);
      onImageUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSetOfficial = async (ver: ImageVersion) => {
    const updated = await api.setOfficialVersion(current.id, ver.id);
    setCurrent(updated);
    onImageUpdated(updated);
  };

  const handleDeleteVersion = async (ver: ImageVersion) => {
    try {
      const res = await api.deleteImageVersion(current.id, ver.id);
      if (res.deletedImage) {
        onImageUpdated(null);
        onClose();
      } else if (res.image) {
        setCurrent(res.image);
        setSelectedVerId(res.image.officialVersionId);
        onImageUpdated(res.image);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDownload = async (format: 'png' | 'jpg') => {
    if (!activeVersion) return;
    if (format === 'png') {
      const a = document.createElement('a');
      a.href = activeVersion.url;
      a.download = `${current.title.replace(/\s+/g, '_')}_v${activeVersion.versionNumber}.png`;
      a.click();
      return;
    }

    // Convert via canvas to high-quality JPG
    const imgEl = new Image();
    imgEl.crossOrigin = 'anonymous';
    imgEl.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = imgEl.naturalWidth;
      canvas.height = imgEl.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#0B0C0E';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(imgEl, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${current.title.replace(/\s+/g, '_')}_v${activeVersion.versionNumber}.jpg`;
      a.click();
    };
    imgEl.src = activeVersion.url;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-6">
      <div className="w-full max-w-6xl max-h-[94vh] bg-[#131519] border border-[#262A33] rounded-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#262A33] flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-[#ECEEF2] truncate">
              {current.title}
            </h2>
            {activeVersion && (
              <p className="text-xs text-[#8E96A4] font-mono tabular-nums mt-0.5">
                v{activeVersion.versionNumber} · {activeVersion.modelId} · {activeVersion.resolution} ·{' '}
                {activeVersion.aspectRatio} · ${activeVersion.estimatedCostUsd.toFixed(3)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {versions.length > 1 && (
              <button
                type="button"
                onClick={() => setCompareMode((v) => !v)}
                className={`px-3 py-1.5 text-xs rounded-md border inline-flex items-center gap-1.5 whitespace-nowrap ${
                  compareMode
                    ? 'bg-[#C9A66B] text-[#0B0C0E] border-[#C9A66B] font-medium'
                    : 'bg-[#0B0C0E] text-[#C6CDD8] border-[#262A33] hover:text-[#ECEEF2]'
                }`}
              >
                <Columns2 className="w-3.5 h-3.5" />
                {t(lang, 'compareVersions')}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleDownload('png')}
              className="px-3 py-1.5 text-xs bg-[#0B0C0E] border border-[#262A33] text-[#C6CDD8] hover:text-[#ECEEF2] rounded-md inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              PNG
            </button>
            <button
              type="button"
              onClick={() => handleDownload('jpg')}
              className="px-3 py-1.5 text-xs bg-[#0B0C0E] border border-[#262A33] text-[#C6CDD8] hover:text-[#ECEEF2] rounded-md inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              JPG
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-[#8E96A4] hover:text-[#ECEEF2] rounded-md hover:bg-[#1B1E24]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Split */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {/* Center Stage + Retouch Controls */}
          <div className="lg:col-span-8 flex flex-col overflow-y-auto p-6 space-y-4 bg-[#0B0C0E]">
            {error && (
              <div className="p-3 bg-[#2A1417] border border-[#7F1D1D] rounded-md text-xs text-[#FCA5A5]">
                {error}
              </div>
            )}
            {notice && (
              <div className="p-3 bg-[#1E1A12] border border-[#C9A66B]/40 rounded-md text-xs text-[#E5C996]">
                {notice}
              </div>
            )}

            {/* Viewer */}
            {compareMode && compareVersion && activeVersion ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-[#8E96A4]">
                    <span>
                      {lang === 'en' ? 'Active' : 'Active'} · v{activeVersion.versionNumber}
                    </span>
                  </div>
                  <div className="aspect-video bg-[#121419] border border-[#262A33] rounded-md overflow-hidden">
                    <StudioImage
                      src={activeVersion.url}
                      alt={current.title}
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-[#8E96A4]">
                    <span>{lang === 'en' ? 'Compare with' : 'Comparer avec'}</span>
                    <select
                      value={compareVersion.id}
                      onChange={(e) => setCompareVerId(e.target.value)}
                      className="bg-[#131519] border border-[#262A33] rounded px-2 py-0.5 text-xs font-mono text-[#ECEEF2]"
                    >
                      {versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          v{v.versionNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="aspect-video bg-[#121419] border border-[#262A33] rounded-md overflow-hidden">
                    <StudioImage
                      src={compareVersion.url}
                      alt={current.title}
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div
                ref={stageRef}
                onMouseDown={handleStageMouseDown}
                onMouseMove={handleStageMouseMove}
                onMouseUp={handleStageMouseUp}
                className={`relative aspect-video bg-[#121419] border border-[#262A33] rounded-md overflow-hidden select-none ${
                  selectRegionMode ? 'cursor-crosshair' : ''
                }`}
              >
                <StudioImage
                  src={activeVersion?.url}
                  alt={current.title}
                  className="w-full h-full object-contain pointer-events-none"
                />
                {regionBox && regionBox.widthPct > 1 && (
                  <div
                    className="absolute border-2 border-[#C9A66B] bg-[#C9A66B]/15 pointer-events-none"
                    style={{
                      left: `${regionBox.xPct}%`,
                      top: `${regionBox.yPct}%`,
                      width: `${regionBox.widthPct}%`,
                      height: `${regionBox.heightPct}%`,
                    }}
                  />
                )}
              </div>
            )}

            {/* Non-Destructive Retouch Console */}
            <div className="p-4 bg-[#131519] border border-[#262A33] rounded-md space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#ECEEF2] inline-flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-[#C9A66B]" />
                  {lang === 'en'
                    ? 'Non-Destructive Retouch (creates a new version)'
                    : 'Retouche conversationnelle non destructive (crée une nouvelle version)'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectRegionMode((v) => !v);
                      if (selectRegionMode) setRegionBox(null);
                    }}
                    className={`px-2.5 py-1 text-xs rounded border inline-flex items-center gap-1.5 ${
                      selectRegionMode || regionBox
                        ? 'border-[#C9A66B] text-[#C9A66B] bg-[#1E1A12]'
                        : 'border-[#262A33] text-[#A6AEBC] hover:text-[#ECEEF2]'
                    }`}
                  >
                    <Crop className="w-3.5 h-3.5" />
                    {regionBox
                      ? lang === 'en'
                        ? 'Zone selected'
                        : 'Zone sélectionnée'
                      : lang === 'en'
                        ? 'Select zone'
                        : 'Sélectionner une zone'}
                  </button>
                  {regionBox && (
                    <button
                      type="button"
                      onClick={() => setRegionBox(null)}
                      className="text-xs text-[#8E96A4] hover:text-[#ECEEF2]"
                    >
                      {lang === 'en' ? 'Reset zone' : 'Effacer zone'}
                    </button>
                  )}
                </div>
              </div>

              {(selectRegionMode || regionBox) && (
                <p className="text-xs text-[#A6AEBC]">
                  {lang === 'en'
                    ? 'Drag on the frame to mark the target area. Note: Gemini uses guided visual retouching from the source image + region coordinates (not binary pixel-locked masking).'
                    : 'Tracez un rectangle sur l’image pour cibler la zone. Note technique : Gemini applique une retouche guidée à partir de l’image originale et de la zone (et non un masque binaire pixel-strict).'}
                </p>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={editInstruction}
                  onChange={(e) => setEditInstruction(e.target.value)}
                  placeholder={
                    lang === 'en'
                      ? 'Describe the adjustment (e.g. soften tungsten rim light on left cheek, add light rain on window)...'
                      : 'Décrivez la retouche (ex. adoucir le contre-jour sur la joue gauche, ajouter une pluie fine sur la vitre)...'
                  }
                  className="flex-1 bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-sm text-[#ECEEF2] focus:outline-none focus:border-[#C9A66B]"
                />
                <select
                  value={editModelId}
                  onChange={(e) => setEditModelId(e.target.value as ImageModelId)}
                  className="bg-[#0B0C0E] border border-[#262A33] rounded-md px-2.5 py-2 text-xs font-mono text-[#ECEEF2]"
                >
                  {settings.pricingTable.map((m) => (
                    <option key={m.modelId} value={m.modelId}>
                      {m.modelId}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!editInstruction.trim() || submitting}
                  onClick={() => setConfirmEdit(true)}
                  className="px-4 py-2 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] disabled:opacity-50 whitespace-nowrap"
                >
                  {t(lang, 'retouch')}
                </button>
              </div>

              {confirmEdit && estimate && (
                <div className="p-3 bg-[#171A21] border border-[#C9A66B]/40 rounded-md flex items-center justify-between gap-4">
                  <div className="text-xs text-[#C6CDD8] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#C9A66B] shrink-0" />
                    <span>
                      {lang === 'en' ? 'Confirm paid retouch' : 'Confirmer la retouche payante'} ·{' '}
                      <span className="font-mono tabular-nums text-[#C9A66B]">
                        {estimate.displayCurrency === 'EUR' ? '€' : '$'}
                        {estimate.totalCostDisplay.toFixed(3)}
                      </span>{' '}
                      ({estimate.modelId}) — {lang === 'en' ? 'Original kept intact' : 'Original conservé intact'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setConfirmEdit(false)}
                      className="px-3 py-1.5 text-xs text-[#A6AEBC] hover:text-[#ECEEF2]"
                    >
                      {t(lang, 'cancel')}
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleConfirmRetouch}
                      className="px-3.5 py-1.5 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md inline-flex items-center gap-1.5"
                    >
                      {submitting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      {t(lang, 'confirm')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Active Version Prompt & Metadata */}
            {activeVersion && (
              <div className="p-4 bg-[#131519] border border-[#262A33] rounded-md space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#8E96A4]">
                    {lang === 'en' ? 'Saved Generation Prompt' : 'Prompt enregistré avec cette version'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(activeVersion.prompt).catch(() => {});
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="text-xs text-[#8E96A4] hover:text-[#ECEEF2] inline-flex items-center gap-1"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-[#34D399]" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? t(lang, 'copied') : t(lang, 'copyPrompt')}
                  </button>
                </div>
                <p className="text-xs text-[#C6CDD8] whitespace-pre-wrap leading-relaxed font-mono">
                  {activeVersion.prompt}
                </p>
                {activeVersion.usageTokens && (
                  <p className="text-xs text-[#7D8594] font-mono tabular-nums pt-1">
                    Tokens API : prompt {activeVersion.usageTokens.promptTokenCount ?? '—'} · output{' '}
                    {activeVersion.usageTokens.candidatesTokenCount ?? '—'} · total{' '}
                    {activeVersion.usageTokens.totalTokenCount ?? '—'}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right: Complete Non-Destructive Version History */}
          <div className="lg:col-span-4 border-l border-[#262A33] bg-[#131519] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-[#262A33] flex items-center justify-between">
              <span className="text-xs font-medium text-[#ECEEF2] inline-flex items-center gap-1.5">
                <History className="w-4 h-4 text-[#C9A66B]" />
                {t(lang, 'history')} ({versions.length})
              </span>
              <span className="text-xs text-[#7D8594]">
                {lang === 'en' ? 'Non-destructive' : 'Sans écrasement'}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {versions.map((ver) => {
                const isSelected = ver.id === activeVersion?.id;
                const isOfficial = ver.id === current.officialVersionId;
                return (
                  <div
                    key={ver.id}
                    onClick={() => setSelectedVerId(ver.id)}
                    className={`p-3 rounded-md border cursor-pointer transition-colors space-y-2 ${
                      isSelected
                        ? 'bg-[#1B1E24] border-[#C9A66B]'
                        : 'bg-[#0F1115] border-[#262A33] hover:border-[#3A404F]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-16 h-11 rounded overflow-hidden bg-[#0B0C0E] shrink-0 border border-[#262A33]">
                        <StudioImage
                          src={ver.url}
                          alt={`v${ver.versionNumber}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-medium text-[#ECEEF2]">
                            v{ver.versionNumber}
                            {isOfficial && (
                              <span className="ml-2 text-[#C9A66B] font-sans">
                                · {t(lang, 'officialImage')}
                              </span>
                            )}
                          </span>
                          <span className="font-mono tabular-nums text-[#7D8594]">
                            ${ver.estimatedCostUsd.toFixed(3)}
                          </span>
                        </div>
                        <p className="text-xs text-[#8E96A4] truncate mt-0.5">
                          {ver.editInstruction ||
                            (lang === 'en' ? 'Original generation' : 'Génération originale')}
                        </p>
                        <p className="text-[11px] text-[#6E7685] font-mono tabular-nums mt-0.5">
                          {new Date(ver.createdAt).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-[#262A33]/60">
                      {!isOfficial && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetOfficial(ver);
                          }}
                          className="px-2 py-1 text-[11px] bg-[#262A33] text-[#ECEEF2] rounded hover:bg-[#323846]"
                        >
                          {t(lang, 'setOfficial')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRestore(ver);
                        }}
                        title={t(lang, 'restore')}
                        className="p-1.5 text-[#8E96A4] hover:text-[#ECEEF2] rounded hover:bg-[#262A33]"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicate(ver);
                        }}
                        title={t(lang, 'duplicate')}
                        className="p-1.5 text-[#8E96A4] hover:text-[#ECEEF2] rounded hover:bg-[#262A33]"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteVersion(ver);
                        }}
                        title={t(lang, 'delete')}
                        className="p-1.5 text-[#8E96A4] hover:text-[#F87171] rounded hover:bg-[#2A1417]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
