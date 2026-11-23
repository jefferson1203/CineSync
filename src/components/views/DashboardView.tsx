import {
  ArrowRight,
  Clapperboard,
  Film,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  MapPin,
  ScrollText,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { t } from '../../shared/i18n.ts';
import type {
  ActivityLogEntry,
  GeneratedImage,
  NavSection,
  Project,
  StudioSettings,
} from '../../shared/types.ts';
import { StudioImage } from '../ui/StudioImage.tsx';

interface DashboardViewProps {
  settings: StudioSettings;
  projects: Project[];
  activeProject: Project | null;
  recentImages: GeneratedImage[];
  recentActivity: ActivityLogEntry[];
  totalEstimatedCostUsd: number;
  totalGeneratedImages: number;
  onSelectProject: (projectId: string) => void;
  onNavigate: (section: NavSection) => void;
  onOpenNewProject: () => void;
  onInspectImage: (image: GeneratedImage) => void;
}

export function DashboardView({
  settings,
  projects,
  activeProject,
  recentImages,
  recentActivity,
  totalEstimatedCostUsd,
  totalGeneratedImages,
  onSelectProject,
  onNavigate,
  onOpenNewProject,
  onInspectImage,
}: DashboardViewProps) {
  const lang = settings.language;
  const currency = settings.currency;
  const displayCost =
    currency === 'EUR' ? totalEstimatedCostUsd * (settings.eurExchangeRate || 0.92) : totalEstimatedCostUsd;
  const currencySymbol = currency === 'EUR' ? '€' : '$';

  const counts = activeProject?.counts ?? {
    characters: 0,
    outfits: 0,
    locations: 0,
    screenplays: 0,
    scenes: 0,
    shots: 0,
    images: 0,
  };

  // Readiness progress calculation across core pre-production milestones
  const milestones = [
    { label: t(lang, 'screenplays'), done: counts.screenplays > 0 },
    { label: t(lang, 'characters'), done: counts.characters > 0 },
    { label: t(lang, 'locations'), done: counts.locations > 0 },
    { label: t(lang, 'scenes'), done: counts.scenes > 0 },
    { label: lang === 'en' ? 'Storyboards' : 'Storyboards', done: counts.shots > 0 },
    { label: t(lang, 'images'), done: counts.images > 0 },
  ];
  const progressPct = activeProject
    ? Math.round((milestones.filter((m) => m.done).length / milestones.length) * 100)
    : 0;

  return (
    <div className="space-y-8">
      {/* Cinema Workbench Hero */}
      <section className="relative rounded-lg overflow-hidden border border-[#262A33] bg-[#131519]">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-3">
              <p className="text-xs text-[#C9A66B] font-medium">
                {activeProject
                  ? `${lang === 'en' ? 'Active Production' : 'Production active'} · ${activeProject.genre || 'Cinéma'} · ${activeProject.aspectRatio}`
                  : lang === 'en'
                    ? 'Local Film Pre-Production Workbench'
                    : 'Studio local de préproduction cinématographique'}
              </p>
              <h1 className="font-display text-3xl font-semibold text-[#ECEEF2] tracking-tight">
                {activeProject ? activeProject.title : t(lang, 'dashboardWelcome')}
              </h1>
              <p className="text-sm text-[#9CA3B2] max-w-2xl leading-relaxed">
                {activeProject?.logline || t(lang, 'dashboardSubtitle')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {activeProject ? (
                <>
                  <button
                    type="button"
                    onClick={() => onNavigate('characters')}
                    className="px-4 py-2.5 text-sm font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] inline-flex items-center gap-2 whitespace-nowrap"
                  >
                    <Users className="w-4 h-4" />
                    {lang === 'en' ? 'Open Character Studio' : 'Ouvrir Character Studio'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('storyboards')}
                    className="px-4 py-2.5 text-sm font-medium bg-[#1B1E24] text-[#ECEEF2] border border-[#2C313C] rounded-md hover:bg-[#232730] inline-flex items-center gap-2 whitespace-nowrap"
                  >
                    <Clapperboard className="w-4 h-4" />
                    Storyboard Studio
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('assistant')}
                    className="px-4 py-2.5 text-sm text-[#C6CDD8] hover:text-[#ECEEF2] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Sparkles className="w-4 h-4 text-[#C9A66B]" />
                    {lang === 'en' ? 'Ask Central Assistant' : 'Assistant IA central'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={onOpenNewProject}
                  className="px-5 py-2.5 text-sm font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <FolderPlus className="w-4 h-4" />
                  {t(lang, 'newProject')}
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 relative min-h-[220px] bg-[#0B0C0E]">
            <StudioImage
              src="/src/assets/images/storyboard_desk_guide_1795442547260.jpg"
              alt="CineStudio AI Director Workbench"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#131519] via-[#131519]/30 to-transparent lg:block hidden" />
          </div>
        </div>
      </section>

      {/* Studio KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          { label: t(lang, 'characters'), value: counts.characters, nav: 'characters' as NavSection },
          { label: t(lang, 'locations'), value: counts.locations, nav: 'locations' as NavSection },
          { label: t(lang, 'scenes'), value: counts.scenes, nav: 'scenes' as NavSection },
          { label: t(lang, 'shots'), value: counts.shots, nav: 'storyboards' as NavSection },
          { label: t(lang, 'images'), value: totalGeneratedImages, nav: 'library' as NavSection },
          {
            label: t(lang, 'budgetConsumed'),
            value: `${currencySymbol}${displayCost.toFixed(2)}`,
            nav: 'budget' as NavSection,
          },
        ].map((metric) => (
          <button
            key={metric.label}
            type="button"
            onClick={() => onNavigate(metric.nav)}
            className="text-left p-4 bg-[#131519] border border-[#262A33] rounded-md hover:border-[#3A404F] transition-colors"
          >
            <div className="text-xs text-[#8E96A4] truncate">{metric.label}</div>
            <div className="font-mono tabular-nums text-2xl font-semibold text-[#ECEEF2] mt-1.5">
              {metric.value}
            </div>
          </button>
        ))}
      </section>

      {/* Active Project Progress + Quick Modules */}
      {activeProject && (
        <section className="p-5 bg-[#131519] border border-[#262A33] rounded-md space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-[#ECEEF2]">
                {t(lang, 'projectProgress')}
              </h2>
              <p className="text-xs text-[#8E96A4] mt-0.5 font-mono truncate">
                {activeProject.folderPath}
              </p>
            </div>
            <span className="font-mono tabular-nums text-sm font-semibold text-[#C9A66B]">
              {progressPct}%
            </span>
          </div>
          <div className="h-1.5 bg-[#0B0C0E] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#C9A66B] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            {milestones.map((m) => (
              <span key={m.label} className={m.done ? 'text-[#ECEEF2]' : 'text-[#6E7685]'}>
                {m.done ? '✓' : '○'} {m.label}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Main Two-Column Content: Latest Generations + Recent Projects & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Latest Generated Images */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-[#ECEEF2]">
              {t(lang, 'recentGenerations')}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('library')}
              className="text-xs text-[#C9A66B] hover:text-[#DFC28C] inline-flex items-center gap-1"
            >
              {lang === 'en' ? 'Open full library' : 'Ouvrir la bibliothèque'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentImages.length === 0 ? (
            <div className="p-8 bg-[#131519] border border-[#262A33] rounded-md text-center space-y-2">
              <ImageIcon className="w-8 h-8 text-[#565E6E] mx-auto" />
              <p className="text-sm text-[#A6AEBC]">
                {lang === 'en'
                  ? 'No cinema frames generated yet.'
                  : 'Aucune image générée pour le moment.'}
              </p>
              <p className="text-xs text-[#7D8594]">
                {lang === 'en'
                  ? 'Start by creating a character, location, or storyboard shot, then launch a real Google Gemini generation.'
                  : 'Créez un personnage, un décor ou un plan de storyboard pour lancer votre première génération Google Gemini.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {recentImages.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => onInspectImage(img)}
                  className="group text-left bg-[#131519] border border-[#262A33] rounded-md overflow-hidden hover:border-[#C9A66B] transition-colors"
                >
                  <div className="aspect-[4/3] bg-[#0B0C0E] overflow-hidden">
                    <StudioImage
                      src={img.officialVersion?.url}
                      alt={img.title}
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                    />
                  </div>
                  <div className="p-2.5">
                    <div className="text-xs font-medium text-[#ECEEF2] truncate">{img.title}</div>
                    <div className="text-[11px] font-mono tabular-nums text-[#7D8594] truncate mt-0.5">
                      {img.officialVersion?.aspectRatio} · {img.officialVersion?.resolution}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Quick Studio Shortcuts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            {[
              { icon: ScrollText, title: t(lang, 'screenplays'), nav: 'screenplays' as NavSection },
              { icon: MapPin, title: t(lang, 'locations'), nav: 'locations' as NavSection },
              { icon: Layers, title: t(lang, 'scenes'), nav: 'scenes' as NavSection },
              { icon: Wallet, title: lang === 'en' ? 'Budget' : 'Budget', nav: 'budget' as NavSection },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.nav}
                  type="button"
                  onClick={() => onNavigate(item.nav)}
                  className="p-3.5 bg-[#131519] border border-[#262A33] rounded-md hover:border-[#3A404F] flex items-center gap-3 text-left transition-colors"
                >
                  <Icon className="w-4 h-4 text-[#C9A66B] shrink-0" />
                  <span className="text-xs font-medium text-[#ECEEF2] truncate">{item.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Recent Projects & Activity */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#131519] border border-[#262A33] rounded-md p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-[#ECEEF2]">
                {t(lang, 'recentProjects')}
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('projects')}
                className="text-xs text-[#C9A66B] hover:text-[#DFC28C]"
              >
                {lang === 'en' ? 'Manage' : 'Gérer'}
              </button>
            </div>
            {projects.length === 0 ? (
              <p className="text-xs text-[#7D8594] py-3">
                {lang === 'en' ? 'No local projects yet.' : 'Aucun projet local créé.'}
              </p>
            ) : (
              <div className="divide-y divide-[#262A33]">
                {projects.slice(0, 5).map((p) => {
                  const isActive = activeProject?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onSelectProject(p.id)}
                      className="w-full py-2.5 text-left flex items-center justify-between gap-2 hover:text-[#ECEEF2] transition-colors"
                    >
                      <div className="min-w-0">
                        <div
                          className={`text-sm font-medium truncate ${
                            isActive ? 'text-[#C9A66B]' : 'text-[#ECEEF2]'
                          }`}
                        >
                          {p.title}
                        </div>
                        <div className="text-xs text-[#7D8594] font-mono tabular-nums mt-0.5">
                          {p.counts?.characters ?? 0} pers. · {p.counts?.scenes ?? 0} scènes ·{' '}
                          {p.counts?.images ?? 0} img
                        </div>
                      </div>
                      <Film className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#C9A66B]' : 'text-[#565E6E]'}`} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-[#131519] border border-[#262A33] rounded-md p-4 space-y-3">
            <h2 className="font-display text-sm font-semibold text-[#ECEEF2]">
              {t(lang, 'recentActivity')}
            </h2>
            {recentActivity.length === 0 ? (
              <p className="text-xs text-[#7D8594] py-2">
                {lang === 'en' ? 'No activity logged yet.' : 'Aucune activité enregistrée.'}
              </p>
            ) : (
              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {recentActivity.map((act) => (
                  <div key={act.id} className="text-xs border-b border-[#262A33]/60 pb-2 last:border-0">
                    <div className="text-[#C6CDD8]">{act.details}</div>
                    <div className="text-[11px] text-[#6E7685] font-mono tabular-nums mt-0.5">
                      {act.module} · {new Date(act.createdAt).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
