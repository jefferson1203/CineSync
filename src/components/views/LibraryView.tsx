import { Image as ImageIcon, Search, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { t } from '../../shared/i18n.ts';
import type { GeneratedImage, Project, StudioSettings } from '../../shared/types.ts';
import type { GenerationContext } from '../modals/GenerationStudioModal.tsx';
import { StudioImage } from '../ui/StudioImage.tsx';

interface LibraryViewProps {
  settings: StudioSettings;
  project: Project | null;
  images: GeneratedImage[];
  onOpenGenerate: (ctx: GenerationContext) => void;
  onInspectImage: (image: GeneratedImage) => void;
}

export function LibraryView({
  settings,
  project,
  images,
  onOpenGenerate,
  onInspectImage,
}: LibraryViewProps) {
  const lang = settings.language;
  const [filter, setFilter] = useState<string>('all');
  const [query, setQuery] = useState('');

  if (!project) {
    return (
      <div className="p-8 bg-[#131519] border border-[#262A33] rounded-md text-sm text-[#8E96A4]">
        {t(lang, 'emptyProjectPrompt')}
      </div>
    );
  }

  const filtered = images.filter((img) => {
    const matchesCat =
      filter === 'all'
        ? true
        : filter === 'character'
          ? img.entityType.startsWith('character_')
          : img.entityType === filter;
    const matchesQuery =
      !query.trim() ||
      img.title.toLowerCase().includes(query.toLowerCase()) ||
      (img.officialVersion?.prompt ?? '').toLowerCase().includes(query.toLowerCase());
    return matchesCat && matchesQuery;
  });

  const filters = [
    { id: 'all', label: lang === 'en' ? 'All' : 'Toutes' },
    { id: 'character', label: t(lang, 'characters') },
    { id: 'outfit', label: t(lang, 'outfits') },
    { id: 'location', label: t(lang, 'locations') },
    { id: 'storyboard_shot', label: 'Storyboards' },
    { id: 'free', label: lang === 'en' ? 'Free Shots' : 'Libres' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#ECEEF2]">
            {lang === 'en' ? 'Visual Asset Library' : "Bibliothèque d'images"}
          </h1>
          <p className="text-xs text-[#8E96A4] mt-1">
            {lang === 'en'
              ? 'All generated frames, version histories, prompts, and PNG/JPG exports for this project.'
              : 'Toutes les images générées, historiques de versions, prompts enregistrés et exports PNG/JPG du projet.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            onOpenGenerate({
              projectId: project.id,
              entityType: 'free',
              title: lang === 'en' ? 'Cinema Still Frame' : 'Image cinématographique',
              initialPrompt: '',
              defaultAspectRatio: project.aspectRatio,
            })
          }
          className="px-4 py-2 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <Sparkles className="w-4 h-4" />
          {t(lang, 'generateImage')}
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 bg-[#131519] border border-[#262A33] rounded-md p-1">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-xs rounded transition-colors whitespace-nowrap ${
                filter === f.id
                  ? 'bg-[#262A33] text-[#ECEEF2] font-medium'
                  : 'text-[#8E96A4] hover:text-[#ECEEF2]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 text-[#7D8594] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(lang, 'search')}
            className="w-full bg-[#131519] border border-[#262A33] rounded-md pl-8 pr-3 py-2 text-xs text-[#ECEEF2] focus:outline-none focus:border-[#C9A66B]"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-10 bg-[#131519] border border-[#262A33] rounded-md text-center space-y-2">
          <ImageIcon className="w-7 h-7 text-[#565E6E] mx-auto" />
          <p className="text-sm text-[#A6AEBC]">
            {lang === 'en' ? 'No matching images found.' : 'Aucune image correspondante.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => onInspectImage(img)}
              className="group text-left bg-[#131519] border border-[#262A33] hover:border-[#C9A66B] rounded-lg overflow-hidden transition-colors"
            >
              <div className="aspect-video bg-[#0B0C0E] overflow-hidden">
                <StudioImage
                  src={img.officialVersion?.url}
                  alt={img.title}
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                />
              </div>
              <div className="p-3 space-y-1">
                <div className="text-xs font-medium text-[#ECEEF2] truncate">{img.title}</div>
                <div className="text-[11px] font-mono tabular-nums text-[#7D8594] truncate">
                  {img.versions?.length ?? 1} ver. · {img.officialVersion?.aspectRatio} ·{' '}
                  {img.officialVersion?.resolution} · {img.officialVersion?.modelId}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
