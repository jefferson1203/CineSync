import {
  Check,
  Loader2,
  Lock,
  Plus,
  Sparkles,
  Trash2,
  Unlock,
  User,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '../../shared/i18n.ts';
import type {
  Character,
  GeneratedImage,
  ImageEntityType,
  Project,
  StudioSettings,
} from '../../shared/types.ts';
import { api } from '../../services/api.ts';
import type { GenerationContext } from '../modals/GenerationStudioModal.tsx';
import { StudioImage } from '../ui/StudioImage.tsx';

interface CharactersViewProps {
  settings: StudioSettings;
  project: Project | null;
  characters: Character[];
  images: GeneratedImage[];
  onRefresh: () => Promise<void>;
  onOpenGenerate: (ctx: GenerationContext) => void;
  onInspectImage: (image: GeneratedImage) => void;
}

const EMPTY_FORM: Partial<Character> = {
  name: '',
  role: '',
  apparentAge: '',
  gender: '',
  originAndTraits: '',
  height: '',
  build: '',
  skinTone: '',
  faceShape: '',
  eyes: '',
  hair: '',
  hairstyle: '',
  facialHair: '',
  physicalMarks: '',
  personality: '',
  expressions: '',
  visualParticularities: '',
  freeDescription: '',
};

export function CharactersView({
  settings,
  project,
  characters,
  images,
  onRefresh,
  onOpenGenerate,
  onInspectImage,
}: CharactersViewProps) {
  const lang = settings.language;
  const [selectedId, setSelectedId] = useState<string | null>(characters[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [createMode, setCreateMode] = useState<'guided' | 'natural'>('guided');
  const [form, setForm] = useState<Partial<Character>>(EMPTY_FORM);
  const [naturalText, setNaturalText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = characters.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    if (!creating && selected) {
      setForm(selected);
    } else if (!creating && !selected && characters.length > 0) {
      setSelectedId(characters[0].id);
      setForm(characters[0]);
    }
  }, [selected, creating, characters]);

  if (!project) {
    return (
      <div className="p-8 bg-[#131519] border border-[#262A33] rounded-md text-sm text-[#8E96A4]">
        {t(lang, 'emptyProjectPrompt')}
      </div>
    );
  }

  const charImages = selected
    ? images.filter((img) => img.entityId === selected.id)
    : [];

  const handleEnrich = async () => {
    if (!naturalText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const enriched = await api.enrichCharacter(naturalText.trim());
      setForm((prev) => ({ ...prev, ...enriched, freeDescription: naturalText.trim() }));
      setCreateMode('guided');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (creating || !selected) {
        const created = await api.createCharacter(project.id, form);
        setCreating(false);
        await onRefresh();
        setSelectedId(created.id);
      } else {
        await api.updateCharacter(selected.id, form);
        await onRefresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleLock = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.updateCharacter(selected.id, { identityLocked: !selected.identityLocked });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handleToggleOfficialRef = async (imgId: string) => {
    if (!selected) return;
    const exists = selected.officialReferenceIds.includes(imgId);
    const nextRefs = exists
      ? selected.officialReferenceIds.filter((x) => x !== imgId)
      : [...selected.officialReferenceIds, imgId];
    await api.updateCharacter(selected.id, {
      officialReferenceIds: nextRefs,
      primaryImageId: selected.primaryImageId ?? imgId,
    });
    await onRefresh();
  };

  const handleDelete = async () => {
    if (!selected) return;
    await api.deleteCharacter(selected.id);
    setSelectedId(null);
    await onRefresh();
  };

  const buildCharacterIdentitySummary = (c: Character) => {
    return [
      `${c.name}, ${c.gender} ${c.apparentAge}`,
      c.originAndTraits,
      c.height ? `height ${c.height}` : '',
      c.build ? `build: ${c.build}` : '',
      c.skinTone ? `skin tone: ${c.skinTone}` : '',
      c.faceShape ? `face: ${c.faceShape}` : '',
      c.eyes ? `eyes: ${c.eyes}` : '',
      c.hair || c.hairstyle ? `hair: ${[c.hair, c.hairstyle].filter(Boolean).join(', ')}` : '',
      c.facialHair ? `facial hair: ${c.facialHair}` : '',
      c.physicalMarks ? `distinctive marks: ${c.physicalMarks}` : '',
      c.visualParticularities,
    ]
      .filter(Boolean)
      .join(', ');
  };

  const triggerCharacterGen = (
    entityType: ImageEntityType,
    label: string,
    shotPrompt: string,
    defaultAspectRatio: '1:1' | '4:5' | '16:9' = '4:5'
  ) => {
    if (!selected) return;
    const identityBlock = buildCharacterIdentitySummary(selected);
    onOpenGenerate({
      projectId: project.id,
      entityType,
      entityId: selected.id,
      characterSlug: selected.slug,
      title: `${selected.name} — ${label}`,
      initialPrompt: `${shotPrompt}\n\nCHARACTER PHYSICAL IDENTITY (KEEP CONSISTENT): ${identityBlock}.`,
      defaultAspectRatio,
      initialReferenceIds: selected.officialReferenceIds,
      onSelectOfficial: async (img) => {
        const nextRefs = selected.officialReferenceIds.includes(img.id)
          ? selected.officialReferenceIds
          : [...selected.officialReferenceIds, img.id];
        await api.updateCharacter(selected.id, {
          officialReferenceIds: nextRefs,
          primaryImageId: selected.primaryImageId ?? img.id,
        });
        await onRefresh();
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#ECEEF2]">
            Character Studio
          </h1>
          <p className="text-xs text-[#8E96A4] mt-1">
            {lang === 'en'
              ? 'Photorealistic casting profiles, neutral-backdrop reference sheets, and Character Identity Lock.'
              : 'Fiches de casting photoréalistes, planches de référence sur fond neutre et verrouillage d’identité.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setSelectedId(null);
            setForm(EMPTY_FORM);
            setNaturalText('');
          }}
          className="px-4 py-2 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          {lang === 'en' ? 'New Character' : 'Nouveau personnage'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-[#2A1417] border border-[#7F1D1D] rounded-md text-xs text-[#FCA5A5]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Character Roster */}
        <div className="lg:col-span-3 space-y-2.5">
          {characters.length === 0 ? (
            <div className="bg-[#131519] border border-[#262A33] rounded-md overflow-hidden">
              <div className="aspect-[4/3]">
                <StudioImage
                  src="/src/assets/images/character_studio_guide_1795442298094.jpg"
                  alt="Character casting studio"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-4 text-xs text-[#8E96A4]">
                {lang === 'en'
                  ? 'Create your first character via guided form or natural description.'
                  : 'Créez votre premier personnage via le formulaire guidé ou une description libre.'}
              </div>
            </div>
          ) : (
            characters.map((c) => {
              const primaryImg = images.find(
                (i) => i.id === c.primaryImageId || c.officialReferenceIds.includes(i.id)
              );
              const isSelected = !creating && selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setSelectedId(c.id);
                  }}
                  className={`w-full p-3 rounded-md border text-left flex items-center gap-3 transition-colors ${
                    isSelected
                      ? 'bg-[#1B1E24] border-[#C9A66B]'
                      : 'bg-[#131519] border-[#262A33] hover:border-[#3A404F]'
                  }`}
                >
                  <div className="w-12 h-12 rounded bg-[#0B0C0E] overflow-hidden shrink-0 border border-[#262A33]">
                    {primaryImg ? (
                      <StudioImage
                        src={primaryImg.officialVersion?.url}
                        alt={c.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#565E6E]">
                        <User className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[#ECEEF2] truncate flex items-center gap-1.5">
                      <span className="truncate">{c.name}</span>
                      {c.identityLocked && <Lock className="w-3 h-3 text-[#C9A66B] shrink-0" />}
                    </div>
                    <div className="text-xs text-[#7D8594] truncate mt-0.5">
                      {c.role || '—'} · {c.officialReferenceIds.length} réf.
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right Character Sheet & Reference Studio */}
        <div className="lg:col-span-9 space-y-6">
          {(creating || selected) && (
            <div className="p-6 bg-[#131519] border border-[#262A33] rounded-lg space-y-5">
              {/* Top Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#262A33]">
                <div className="flex items-center gap-3">
                  <h2 className="font-display text-lg font-semibold text-[#ECEEF2]">
                    {creating
                      ? lang === 'en'
                        ? 'Create Character'
                        : 'Nouveau personnage'
                      : selected?.name}
                  </h2>
                  {selected && (
                    <span className="text-xs text-[#8E96A4]">
                      ·{' '}
                      {selected.identityLocked ? (
                        <span className="text-[#C9A66B]">{t(lang, 'identityLocked')}</span>
                      ) : (
                        t(lang, 'identityUnlocked')
                      )}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {creating && (
                    <div className="flex items-center bg-[#0B0C0E] border border-[#262A33] rounded-md p-0.5">
                      <button
                        type="button"
                        onClick={() => setCreateMode('guided')}
                        className={`px-3 py-1 text-xs rounded ${
                          createMode === 'guided'
                            ? 'bg-[#262A33] text-[#ECEEF2]'
                            : 'text-[#8E96A4]'
                        }`}
                      >
                        {lang === 'en' ? 'Guided Form' : 'Formulaire guidé'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCreateMode('natural')}
                        className={`px-3 py-1 text-xs rounded ${
                          createMode === 'natural'
                            ? 'bg-[#262A33] text-[#ECEEF2]'
                            : 'text-[#8E96A4]'
                        }`}
                      >
                        {lang === 'en' ? 'Free Description (AI)' : 'Description libre (IA)'}
                      </button>
                    </div>
                  )}

                  {selected && !creating && (
                    <>
                      <button
                        type="button"
                        onClick={handleToggleLock}
                        disabled={busy}
                        className={`px-3 py-1.5 text-xs rounded-md border inline-flex items-center gap-1.5 whitespace-nowrap ${
                          selected.identityLocked
                            ? 'border-[#C9A66B] text-[#C9A66B] bg-[#1E1A12]'
                            : 'border-[#262A33] text-[#C6CDD8] hover:text-[#ECEEF2]'
                        }`}
                      >
                        {selected.identityLocked ? (
                          <>
                            <Unlock className="w-3.5 h-3.5" />
                            {t(lang, 'unlockIdentity')}
                          </>
                        ) : (
                          <>
                            <Lock className="w-3.5 h-3.5" />
                            {t(lang, 'lockIdentity')}
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        className="p-1.5 text-[#7D8594] hover:text-[#F87171] rounded"
                        title={t(lang, 'delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Natural Language AI Character Builder */}
              {createMode === 'natural' && creating ? (
                <div className="space-y-3">
                  <label className="block text-xs text-[#8E96A4]">
                    {lang === 'en'
                      ? 'Describe your character naturally — Gemini will build a complete casting sheet.'
                      : 'Décrivez votre personnage en langage naturel — Gemini générera une fiche complète modifiable.'}
                  </label>
                  <textarea
                    rows={4}
                    value={naturalText}
                    onChange={(e) => setNaturalText(e.target.value)}
                    placeholder="ex. Inspecteur de police de 42 ans d'origine méditerranéenne, regard fatigué mais vif, cicatrice discrète près du sourcil gauche, barbe courte poivre et sel..."
                    className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3.5 py-2.5 text-sm text-[#ECEEF2]"
                  />
                  <button
                    type="button"
                    disabled={busy || !naturalText.trim()}
                    onClick={handleEnrich}
                    className="px-4 py-2 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {t(lang, 'aiCompleteSheet')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSave} className="space-y-4">
                  {selected?.identityLocked && !creating && (
                    <div className="p-3 bg-[#1E1A12] border border-[#C9A66B]/40 rounded-md text-xs text-[#E5C996]">
                      {lang === 'en'
                        ? 'Identity Lock active: physical identity fields are protected and official reference images are automatically injected into future generations. Note: visual references strongly guide Gemini consistency, though generative models cannot guarantee 100% pixel-identical faces across every angle.'
                        : 'Identité verrouillée : les traits physiques sont protégés et les références officielles sont réinjectées automatiquement dans les générations futures. Note honnête : les références visuelles guident fortement la cohérence de Gemini, sans qu’un prompt seul ne puisse garantir une identité mathématiquement parfaite sous tous les angles.'}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {[
                      { key: 'name', label: lang === 'en' ? 'Name *' : 'Nom *', required: true },
                      { key: 'role', label: lang === 'en' ? 'Story Role' : "Rôle dans l'histoire" },
                      { key: 'apparentAge', label: lang === 'en' ? 'Apparent Age' : 'Âge apparent' },
                      { key: 'gender', label: lang === 'en' ? 'Gender' : 'Sexe' },
                      { key: 'originAndTraits', label: lang === 'en' ? 'Origin & Traits' : 'Origine & traits' },
                      { key: 'height', label: lang === 'en' ? 'Height' : 'Taille' },
                      { key: 'build', label: lang === 'en' ? 'Build' : 'Morphologie' },
                      { key: 'skinTone', label: lang === 'en' ? 'Skin Tone' : 'Teint' },
                      { key: 'faceShape', label: lang === 'en' ? 'Face' : 'Visage' },
                      { key: 'eyes', label: lang === 'en' ? 'Eyes' : 'Yeux' },
                      { key: 'hair', label: lang === 'en' ? 'Hair' : 'Cheveux' },
                      { key: 'hairstyle', label: lang === 'en' ? 'Hairstyle' : 'Coiffure' },
                      { key: 'facialHair', label: lang === 'en' ? 'Beard / Facial Hair' : 'Barbe' },
                      { key: 'physicalMarks', label: lang === 'en' ? 'Physical Marks' : 'Marques physiques' },
                      { key: 'personality', label: lang === 'en' ? 'Personality' : 'Personnalité' },
                      { key: 'expressions', label: lang === 'en' ? 'Expressions' : 'Expressions' },
                    ].map((field) => {
                      const locked = Boolean(!creating && selected?.identityLocked && field.key !== 'personality' && field.key !== 'expressions');
                      return (
                        <div key={field.key}>
                          <label className="block text-[11px] text-[#8E96A4] mb-1">
                            {field.label}
                          </label>
                          <input
                            required={field.required}
                            disabled={locked}
                            value={String((form as Record<string, unknown>)[field.key] ?? '')}
                            onChange={(e) =>
                              setForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                            }
                            className="w-full bg-[#0B0C0E] border border-[#262A33] rounded px-2.5 py-1.5 text-xs text-[#ECEEF2] disabled:opacity-55 focus:outline-none focus:border-[#C9A66B]"
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#8E96A4] mb-1">
                      {lang === 'en' ? 'Visual Particularities' : 'Particularités visuelles'}
                    </label>
                    <input
                      disabled={Boolean(!creating && selected?.identityLocked)}
                      value={form.visualParticularities ?? ''}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, visualParticularities: e.target.value }))
                      }
                      className="w-full bg-[#0B0C0E] border border-[#262A33] rounded px-3 py-1.5 text-xs text-[#ECEEF2] disabled:opacity-55"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    {creating && (
                      <button
                        type="button"
                        onClick={() => setCreating(false)}
                        className="px-4 py-2 text-xs text-[#A6AEBC]"
                      >
                        {t(lang, 'cancel')}
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-5 py-2 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] inline-flex items-center gap-2"
                    >
                      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {creating ? t(lang, 'create') : t(lang, 'save')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Reference Sheet Generation & Official Reference Selection */}
          {selected && !creating && (
            <div className="p-6 bg-[#131519] border border-[#262A33] rounded-lg space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-semibold text-[#ECEEF2]">
                    {lang === 'en'
                      ? 'Reference Sheets & Identity Gallery'
                      : 'Planches de référence & Verrouillage visuel'}
                  </h3>
                  <p className="text-xs text-[#8E96A4] mt-0.5">
                    {lang === 'en'
                      ? 'Generate neutral-backdrop references, compare takes, mark official references, then lock identity.'
                      : 'Générez les références sur fond neutre, comparez, sélectionnez les références officielles puis verrouillez.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    triggerCharacterGen(
                      'character_portrait',
                      lang === 'en' ? 'Face Portrait' : 'Portrait visage',
                      'Photorealistic film casting close-up portrait of the face, 85mm prime cinema lens, neutral seamless mid-gray studio background, soft directional studio key light, authentic unretouched skin texture, calm natural expression.',
                      '4:5'
                    )
                  }
                  className="px-3.5 py-2 text-xs bg-[#1B1E24] border border-[#2C313C] text-[#ECEEF2] hover:border-[#C9A66B] rounded-md inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#C9A66B]" />
                  {lang === 'en' ? 'Detailed Face Portrait' : 'Portrait détaillé du visage'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    triggerCharacterGen(
                      'character_fullbody',
                      lang === 'en' ? 'Full Body' : 'Vue complète du corps',
                      'Photorealistic full-body standing casting photograph head to toe on neutral light gray seamless studio backdrop, 50mm lens, natural relaxed stance, simple neutral fitting clothing, balanced soft studio light.',
                      '4:5'
                    )
                  }
                  className="px-3.5 py-2 text-xs bg-[#1B1E24] border border-[#2C313C] text-[#ECEEF2] hover:border-[#C9A66B] rounded-md inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#C9A66B]" />
                  {lang === 'en' ? 'Full Body View' : 'Vue complète du corps'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    triggerCharacterGen(
                      'character_turnaround',
                      lang === 'en' ? '3-View Turnaround Sheet' : 'Planche Face / Profil / Dos',
                      'Professional cinema character turnaround reference sheet on a clean seamless neutral light gray studio background showing three full-body views side-by-side: front view, 90-degree side profile view, and rear back view. Identical individual across all three views, neutral studio lighting, zero stylization.',
                      '16:9'
                    )
                  }
                  className="px-3.5 py-2 text-xs bg-[#1B1E24] border border-[#2C313C] text-[#ECEEF2] hover:border-[#C9A66B] rounded-md inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#C9A66B]" />
                  {lang === 'en' ? 'Face / Profile / Back Sheet' : 'Planche Face / Profil / Dos'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    triggerCharacterGen(
                      'character_expression',
                      lang === 'en' ? 'Facial Expressions' : 'Expressions faciales',
                      'Photorealistic film actor expression study sheet on neutral mid-gray studio backdrop: 4 close-up headshots showing subtle natural emotions (neutral, quiet determination, concern, restrained warmth), identical individual, 85mm cinema lens.',
                      '16:9'
                    )
                  }
                  className="px-3.5 py-2 text-xs bg-[#1B1E24] border border-[#2C313C] text-[#ECEEF2] hover:border-[#C9A66B] rounded-md inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#C9A66B]" />
                  {lang === 'en' ? 'Facial Expressions' : 'Expressions faciales'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    triggerCharacterGen(
                      'character_pose',
                      lang === 'en' ? 'Poses & Attitudes' : 'Poses & attitudes',
                      'Photorealistic film character attitude and posture study on neutral dark gray studio floor and backdrop, natural candid standing and seated gestures, 50mm lens, documentary cinema lighting.',
                      '16:9'
                    )
                  }
                  className="px-3.5 py-2 text-xs bg-[#1B1E24] border border-[#2C313C] text-[#ECEEF2] hover:border-[#C9A66B] rounded-md inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#C9A66B]" />
                  {lang === 'en' ? 'Poses & Attitudes' : 'Poses et attitudes'}
                </button>
              </div>

              {charImages.length === 0 ? (
                <div className="p-6 bg-[#0B0C0E] border border-[#262A33] rounded-md text-xs text-[#7D8594]">
                  {lang === 'en'
                    ? 'No reference images generated for this character yet.'
                    : 'Aucune image de référence générée pour ce personnage pour le moment.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {charImages.map((img) => {
                    const isOfficialRef = selected.officialReferenceIds.includes(img.id);
                    return (
                      <div
                        key={img.id}
                        className={`bg-[#0B0C0E] border rounded-md overflow-hidden ${
                          isOfficialRef ? 'border-[#C9A66B]' : 'border-[#262A33]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onInspectImage(img)}
                          className="w-full aspect-[4/3] bg-[#121419] overflow-hidden block"
                        >
                          <StudioImage
                            src={img.officialVersion?.url}
                            alt={img.title}
                            className="w-full h-full object-cover"
                          />
                        </button>
                        <div className="p-3 space-y-2">
                          <div className="text-xs font-medium text-[#ECEEF2] truncate">
                            {img.title}
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleOfficialRef(img.id)}
                              className={`px-2.5 py-1 text-[11px] rounded inline-flex items-center gap-1 ${
                                isOfficialRef
                                  ? 'bg-[#C9A66B] text-[#0B0C0E] font-medium'
                                  : 'bg-[#1B1E24] text-[#C6CDD8] hover:text-[#ECEEF2]'
                              }`}
                            >
                              {isOfficialRef && <Check className="w-3 h-3" />}
                              {isOfficialRef
                                ? lang === 'en'
                                  ? 'Official Ref'
                                  : 'Réf. officielle'
                                : lang === 'en'
                                  ? 'Use as Ref'
                                  : 'Choisir en réf.'}
                            </button>
                            <button
                              type="button"
                              onClick={() => onInspectImage(img)}
                              className="text-[11px] text-[#8E96A4] hover:text-[#ECEEF2]"
                            >
                              {t(lang, 'history')} · {t(lang, 'retouch')}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
