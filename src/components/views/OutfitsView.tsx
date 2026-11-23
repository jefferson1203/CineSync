import { Plus, Shirt, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { OUTFIT_CATEGORY_LABELS, t } from '../../shared/i18n.ts';
import type {
  Character,
  GeneratedImage,
  Outfit,
  OutfitCategory,
  Project,
  StudioSettings,
} from '../../shared/types.ts';
import { api } from '../../services/api.ts';
import type { GenerationContext } from '../modals/GenerationStudioModal.tsx';
import { StudioImage } from '../ui/StudioImage.tsx';

interface OutfitsViewProps {
  settings: StudioSettings;
  project: Project | null;
  characters: Character[];
  outfits: Outfit[];
  images: GeneratedImage[];
  onRefresh: () => Promise<void>;
  onOpenGenerate: (ctx: GenerationContext) => void;
  onInspectImage: (image: GeneratedImage) => void;
}

export function OutfitsView({
  settings,
  project,
  characters,
  outfits,
  images,
  onRefresh,
  onOpenGenerate,
  onInspectImage,
}: OutfitsViewProps) {
  const lang = settings.language;
  const [filterCharId, setFilterCharId] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [characterId, setCharacterId] = useState<string>(characters[0]?.id ?? '');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<OutfitCategory>('daily');
  const [description, setDescription] = useState('');
  const [fabricsAndColors, setFabricsAndColors] = useState('');
  const [accessories, setAccessories] = useState('');
  const [sceneNotes, setSceneNotes] = useState('');

  if (!project) {
    return (
      <div className="p-8 bg-[#131519] border border-[#262A33] rounded-md text-sm text-[#8E96A4]">
        {t(lang, 'emptyProjectPrompt')}
      </div>
    );
  }

  const visibleOutfits =
    filterCharId === 'all' ? outfits : outfits.filter((o) => o.characterId === filterCharId);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetCharId = characterId || characters[0]?.id;
    if (!name.trim() || !targetCharId) return;
    await api.createOutfit(project.id, {
      characterId: targetCharId,
      name: name.trim(),
      category,
      description,
      fabricsAndColors,
      accessories,
      sceneNotes,
    });
    setName('');
    setDescription('');
    setFabricsAndColors('');
    setAccessories('');
    setSceneNotes('');
    setShowForm(false);
    await onRefresh();
  };

  const handleGenerateOutfitVisual = (outfit: Outfit) => {
    const char = characters.find((c) => c.id === outfit.characterId);
    onOpenGenerate({
      projectId: project.id,
      entityType: 'outfit',
      entityId: outfit.id,
      characterSlug: char?.slug ?? null,
      title: `${char?.name ?? 'Personnage'} — ${outfit.name}`,
      initialPrompt: `Full-length wardrobe fitting still photograph on neutral light gray studio backdrop. Subject: ${
        char?.name ?? 'character'
      } (${char?.apparentAge ?? ''}, ${char?.faceShape ?? ''}, ${char?.hair ?? ''}). PRESERVE EXACT CHARACTER FACE AND BODY IDENTITY from attached references — change ONLY the clothing.\n\nWARDROBE: ${
        outfit.name
      } (${OUTFIT_CATEGORY_LABELS.en[outfit.category]}). ${outfit.description}. Fabrics & colors: ${
        outfit.fabricsAndColors
      }. Accessories: ${outfit.accessories || 'none'}. Realistic fabric drape, stitching, natural folds, 50mm studio lens.`,
      defaultAspectRatio: '4:5',
      initialReferenceIds: char?.officialReferenceIds ?? [],
      onSelectOfficial: async (img) => {
        await api.updateOutfit(outfit.id, { referenceImageId: img.id });
        await onRefresh();
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#ECEEF2]">
            {lang === 'en' ? 'Wardrobe & Accessories' : 'Tenues & Accessoires'}
          </h1>
          <p className="text-xs text-[#8E96A4] mt-1">
            {lang === 'en'
              ? 'Reusable character wardrobe library separated from locked physical identity.'
              : 'Bibliothèque de tenues réutilisables par scène, strictement séparée de l’identité physique verrouillée.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={filterCharId}
            onChange={(e) => setFilterCharId(e.target.value)}
            className="bg-[#131519] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
          >
            <option value="all">
              {lang === 'en' ? 'All characters' : 'Tous les personnages'}
            </option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={characters.length === 0}
            onClick={() => {
              setCharacterId(characters[0]?.id ?? '');
              setShowForm((v) => !v);
            }}
            className="px-4 py-2 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {lang === 'en' ? 'Add Outfit' : 'Ajouter une tenue'}
          </button>
        </div>
      </div>

      {characters.length === 0 && (
        <div className="p-6 bg-[#131519] border border-[#262A33] rounded-md text-xs text-[#8E96A4]">
          {lang === 'en'
            ? 'Create at least one character in Character Studio before assigning outfits.'
            : 'Créez d’abord au moins un personnage dans Character Studio avant de créer sa garde-robe.'}
        </div>
      )}

      {showForm && characters.length > 0 && (
        <form
          onSubmit={handleCreate}
          className="p-6 bg-[#131519] border border-[#262A33] rounded-lg space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">
                {lang === 'en' ? 'Character *' : 'Personnage *'}
              </label>
              <select
                value={characterId || characters[0].id}
                onChange={(e) => setCharacterId(e.target.value)}
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
              >
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">
                {lang === 'en' ? 'Outfit Name *' : 'Nom de la tenue *'}
              </label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex. Imperméable gris anthracite & col roulé"
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">
                {lang === 'en' ? 'Category' : 'Catégorie'}
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as OutfitCategory)}
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
              >
                {(Object.keys(OUTFIT_CATEGORY_LABELS[lang]) as OutfitCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {OUTFIT_CATEGORY_LABELS[lang][cat]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">Description</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">
                {lang === 'en' ? 'Fabrics, Textures & Colors' : 'Matières, textures & couleurs'}
              </label>
              <textarea
                rows={2}
                value={fabricsAndColors}
                onChange={(e) => setFabricsAndColors(e.target.value)}
                placeholder="ex. Laine bouillie mate, coton usé, cuir patiné noir"
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">
                {lang === 'en' ? 'Associated Accessories' : 'Accessoires associés'}
              </label>
              <input
                value={accessories}
                onChange={(e) => setAccessories(e.target.value)}
                placeholder="ex. Montre mécanique acier, sacoche en cuir usé, lunettes écaille"
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">
                {lang === 'en' ? 'Continuity / Scene Notes' : 'Notes de raccord / scènes'}
              </label>
              <input
                value={sceneNotes}
                onChange={(e) => setSceneNotes(e.target.value)}
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-xs text-[#A6AEBC]"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md"
            >
              {t(lang, 'save')}
            </button>
          </div>
        </form>
      )}

      {visibleOutfits.length === 0 ? (
        <div className="p-8 bg-[#131519] border border-[#262A33] rounded-md text-center space-y-2">
          <Shirt className="w-7 h-7 text-[#565E6E] mx-auto" />
          <p className="text-sm text-[#A6AEBC]">
            {lang === 'en' ? 'No outfits recorded yet.' : 'Aucune tenue enregistrée.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleOutfits.map((outfit) => {
            const char = characters.find((c) => c.id === outfit.characterId);
            const refImg = images.find((i) => i.id === outfit.referenceImageId);
            return (
              <div
                key={outfit.id}
                className="bg-[#131519] border border-[#262A33] rounded-lg overflow-hidden flex flex-col"
              >
                <div className="aspect-[4/3] bg-[#0B0C0E] relative">
                  {refImg ? (
                    <button
                      type="button"
                      onClick={() => onInspectImage(refImg)}
                      className="w-full h-full block"
                    >
                      <StudioImage
                        src={refImg.officialVersion?.url}
                        alt={outfit.name}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-[#565E6E] gap-1.5">
                      <Shirt className="w-6 h-6" />
                      <span className="text-xs">
                        {lang === 'en' ? 'No wardrobe fitting image' : 'Aucun visuel de tenue'}
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div className="space-y-1.5">
                    <div className="text-xs text-[#8E96A4]">
                      {char?.name ?? '—'} · {OUTFIT_CATEGORY_LABELS[lang][outfit.category]}
                    </div>
                    <h3 className="font-display text-base font-semibold text-[#ECEEF2]">
                      {outfit.name}
                    </h3>
                    {outfit.description && (
                      <p className="text-xs text-[#9CA3B2] leading-relaxed">{outfit.description}</p>
                    )}
                    {outfit.accessories && (
                      <p className="text-xs text-[#7D8594]">
                        {lang === 'en' ? 'Accessories' : 'Accessoires'} : {outfit.accessories}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#262A33]">
                    <button
                      type="button"
                      onClick={() => handleGenerateOutfitVisual(outfit)}
                      className="px-3 py-1.5 text-xs bg-[#1B1E24] border border-[#2C313C] text-[#ECEEF2] hover:border-[#C9A66B] rounded inline-flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#C9A66B]" />
                      {lang === 'en' ? 'Generate Fitting' : 'Générer la tenue'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await api.deleteOutfit(outfit.id);
                        await onRefresh();
                      }}
                      className="p-1.5 text-[#7D8594] hover:text-[#F87171]"
                      title={t(lang, 'delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
