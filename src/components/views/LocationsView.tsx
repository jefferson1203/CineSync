import { Camera, MapPin, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { LOCATION_TYPE_LABELS, t } from '../../shared/i18n.ts';
import type {
  GeneratedImage,
  LocationItem,
  LocationType,
  Project,
  StudioSettings,
} from '../../shared/types.ts';
import { api } from '../../services/api.ts';
import type { GenerationContext } from '../modals/GenerationStudioModal.tsx';
import { StudioImage } from '../ui/StudioImage.tsx';

interface LocationsViewProps {
  settings: StudioSettings;
  project: Project | null;
  locations: LocationItem[];
  images: GeneratedImage[];
  onRefresh: () => Promise<void>;
  onOpenGenerate: (ctx: GenerationContext) => void;
  onInspectImage: (image: GeneratedImage) => void;
}

export function LocationsView({
  settings,
  project,
  locations,
  images,
  onRefresh,
  onOpenGenerate,
  onInspectImage,
}: LocationsViewProps) {
  const lang = settings.language;
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [locationType, setLocationType] = useState<LocationType>('interior_set');
  const [settingRealOrFictional, setSettingRealOrFictional] = useState('');
  const [ambiance, setAmbiance] = useState('');
  const [lighting, setLighting] = useState('');
  const [architecture, setArchitecture] = useState('');
  const [colorPalette, setColorPalette] = useState('');
  const [description, setDescription] = useState('');

  if (!project) {
    return (
      <div className="p-8 bg-[#131519] border border-[#262A33] rounded-md text-sm text-[#8E96A4]">
        {t(lang, 'emptyProjectPrompt')}
      </div>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await api.createLocation(project.id, {
      name: name.trim(),
      locationType,
      settingRealOrFictional,
      ambiance,
      lighting,
      architecture,
      colorPalette,
      description,
    });
    setName('');
    setDescription('');
    setAmbiance('');
    setLighting('');
    setArchitecture('');
    setColorPalette('');
    setShowForm(false);
    await onRefresh();
  };

  const generateLocationAngle = (loc: LocationItem, angleLabel: string, angleInstruction: string) => {
    const locImages = images.filter((i) => i.entityId === loc.id || loc.referenceImageIds.includes(i.id));
    const refIds = locImages.slice(0, 3).map((i) => i.id);

    onOpenGenerate({
      projectId: project.id,
      entityType: 'location',
      entityId: loc.id,
      title: `${loc.name} — ${angleLabel}`,
      initialPrompt: `Cinema location scout photograph (${angleInstruction}), empty set with no people.\nLocation: ${loc.name} (${LOCATION_TYPE_LABELS.en[loc.locationType]}). Setting: ${loc.settingRealOrFictional}. Architecture: ${loc.architecture}. Ambiance: ${loc.ambiance}. Lighting: ${loc.lighting}. Color palette: ${loc.colorPalette}. ${loc.description}. Preserve exact architecture, materials, and lighting continuity with attached location references.`,
      defaultAspectRatio: project.aspectRatio,
      initialReferenceIds: refIds,
      onSelectOfficial: async (img) => {
        const nextRefs = loc.referenceImageIds.includes(img.id)
          ? loc.referenceImageIds
          : [...loc.referenceImageIds, img.id];
        await api.updateLocation(loc.id, {
          referenceImageIds: nextRefs,
          primaryImageId: loc.primaryImageId ?? img.id,
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
            {lang === 'en' ? 'Locations & Sets Library' : 'Bibliothèque de Décors & Lieux'}
          </h1>
          <p className="text-xs text-[#8E96A4] mt-1">
            {lang === 'en'
              ? 'Reusable production sets with multi-angle scouting views for scene-to-scene spatial continuity.'
              : 'Décors réutilisables avec plusieurs angles de vue pour maintenir la cohérence spatiale entre les scènes.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          {lang === 'en' ? 'New Location' : 'Nouveau décor'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="p-6 bg-[#131519] border border-[#262A33] rounded-lg space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">
                {lang === 'en' ? 'Location Name *' : 'Nom du lieu *'}
              </label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex. Appartement de Clara — Salon"
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">
                {lang === 'en' ? 'Location Type' : 'Type de lieu'}
              </label>
              <select
                value={locationType}
                onChange={(e) => setLocationType(e.target.value as LocationType)}
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
              >
                {(Object.keys(LOCATION_TYPE_LABELS[lang]) as LocationType[]).map((lt) => (
                  <option key={lt} value={lt}>
                    {LOCATION_TYPE_LABELS[lang][lt]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">
                {lang === 'en' ? 'Real or Fictional Setting' : 'Localisation réelle ou fictive'}
              </label>
              <input
                value={settingRealOrFictional}
                onChange={(e) => setSettingRealOrFictional(e.target.value)}
                placeholder="ex. Lyon, quartier Croix-Rousse"
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">Ambiance</label>
              <input
                value={ambiance}
                onChange={(e) => setAmbiance(e.target.value)}
                placeholder="Silencieuse, feutrée, pluvieuse"
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">
                {lang === 'en' ? 'Lighting' : 'Éclairage'}
              </label>
              <input
                value={lighting}
                onChange={(e) => setLighting(e.target.value)}
                placeholder="Lumière rasante fenêtre + lampe tungstène"
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">Architecture</label>
              <input
                value={architecture}
                onChange={(e) => setArchitecture(e.target.value)}
                placeholder="Parquet chevron, hauts plafonds, moulures"
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">
                {lang === 'en' ? 'Color Palette' : 'Palette de couleurs'}
              </label>
              <input
                value={colorPalette}
                onChange={(e) => setColorPalette(e.target.value)}
                placeholder="Ardoise, noyer sombre, ambre pâle"
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#8E96A4] mb-1">Description détaillée</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
            />
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

      {locations.length === 0 ? (
        <div className="p-8 bg-[#131519] border border-[#262A33] rounded-md text-center space-y-2">
          <MapPin className="w-7 h-7 text-[#565E6E] mx-auto" />
          <p className="text-sm text-[#A6AEBC]">
            {lang === 'en' ? 'No locations saved yet.' : 'Aucun décor enregistré dans ce projet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {locations.map((loc) => {
            const locImgs = images.filter(
              (i) => i.entityId === loc.id || loc.referenceImageIds.includes(i.id)
            );
            return (
              <div
                key={loc.id}
                className="p-5 bg-[#131519] border border-[#262A33] rounded-lg space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-xs text-[#8E96A4]">
                      {LOCATION_TYPE_LABELS[lang][loc.locationType]}
                      {loc.settingRealOrFictional && ` · ${loc.settingRealOrFictional}`}
                      {loc.lighting && ` · ${loc.lighting}`}
                    </div>
                    <h3 className="font-display text-lg font-semibold text-[#ECEEF2]">{loc.name}</h3>
                    {loc.description && (
                      <p className="text-xs text-[#9CA3B2] max-w-3xl leading-relaxed">
                        {loc.description}
                      </p>
                    )}
                    <div className="text-xs text-[#7D8594] pt-1">
                      {[loc.architecture, loc.ambiance, loc.colorPalette].filter(Boolean).join(' · ')}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        generateLocationAngle(
                          loc,
                          lang === 'en' ? 'Wide Establishing' : 'Plan large (24mm)',
                          'wide establishing 24mm architectural view'
                        )
                      }
                      className="px-3 py-1.5 text-xs bg-[#1B1E24] border border-[#2C313C] text-[#ECEEF2] hover:border-[#C9A66B] rounded inline-flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#C9A66B]" />
                      {lang === 'en' ? 'Wide View' : 'Vue d’ensemble'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        generateLocationAngle(
                          loc,
                          lang === 'en' ? 'Reverse Angle' : 'Contre-champ (35mm)',
                          'opposite reverse angle 35mm cinema lens showing the other side of the same set'
                        )
                      }
                      className="px-3 py-1.5 text-xs bg-[#1B1E24] border border-[#2C313C] text-[#ECEEF2] hover:border-[#C9A66B] rounded inline-flex items-center gap-1.5"
                    >
                      <Camera className="w-3.5 h-3.5 text-[#C9A66B]" />
                      {lang === 'en' ? 'Reverse Angle' : 'Contre-champ'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        generateLocationAngle(
                          loc,
                          lang === 'en' ? 'Detail / Texture' : 'Détail décor (50mm)',
                          'atmospheric medium detail shot 50mm highlighting textures, props, and practical lighting'
                        )
                      }
                      className="px-3 py-1.5 text-xs bg-[#1B1E24] border border-[#2C313C] text-[#ECEEF2] hover:border-[#C9A66B] rounded inline-flex items-center gap-1.5"
                    >
                      <Camera className="w-3.5 h-3.5 text-[#C9A66B]" />
                      {lang === 'en' ? 'Detail Angle' : 'Angle détail'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await api.deleteLocation(loc.id);
                        await onRefresh();
                      }}
                      className="p-1.5 text-[#7D8594] hover:text-[#F87171]"
                      title={t(lang, 'delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {locImgs.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[#262A33]">
                    {locImgs.map((img) => (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => onInspectImage(img)}
                        className="group text-left bg-[#0B0C0E] border border-[#262A33] hover:border-[#C9A66B] rounded overflow-hidden"
                      >
                        <div className="aspect-video bg-[#121419]">
                          <StudioImage
                            src={img.officialVersion?.url}
                            alt={img.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="p-2 text-[11px] text-[#C6CDD8] truncate">{img.title}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
