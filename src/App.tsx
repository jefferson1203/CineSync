import {
  Bot,
  Clapperboard,
  Film,
  FolderKanban,
  Image as ImageIcon,
  Layers,
  LayoutDashboard,
  MapPin,
  ScrollText,
  Settings,
  Shirt,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { GenerationStudioModal, type GenerationContext } from './components/modals/GenerationStudioModal.tsx';
import { ImageInspectorModal } from './components/modals/ImageInspectorModal.tsx';
import { AssistantView } from './components/views/AssistantView.tsx';
import { BudgetView } from './components/views/BudgetView.tsx';
import { CharactersView } from './components/views/CharactersView.tsx';
import { DashboardView } from './components/views/DashboardView.tsx';
import { LibraryView } from './components/views/LibraryView.tsx';
import { LocationsView } from './components/views/LocationsView.tsx';
import { OutfitsView } from './components/views/OutfitsView.tsx';
import { ProjectsView } from './components/views/ProjectsView.tsx';
import { ScenesView } from './components/views/ScenesView.tsx';
import { ScreenplaysView } from './components/views/ScreenplaysView.tsx';
import { SettingsView } from './components/views/SettingsView.tsx';
import { StoryboardsView } from './components/views/StoryboardsView.tsx';
import { api } from './services/api.ts';
import { NAV_LABELS, t } from './shared/i18n.ts';
import type {
  ActivityLogEntry,
  Character,
  GeneratedImage,
  LocationItem,
  NavSection,
  Outfit,
  Project,
  SceneItem,
  Screenplay,
  StoryboardShot,
  StudioSettings,
} from './shared/types.ts';

const NAV_ITEMS: Array<{ id: NavSection; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', icon: LayoutDashboard },
  { id: 'projects', icon: FolderKanban },
  { id: 'characters', icon: Users },
  { id: 'outfits', icon: Shirt },
  { id: 'locations', icon: MapPin },
  { id: 'screenplays', icon: ScrollText },
  { id: 'scenes', icon: Layers },
  { id: 'storyboards', icon: Clapperboard },
  { id: 'library', icon: ImageIcon },
  { id: 'assistant', icon: Bot },
  { id: 'budget', icon: Wallet },
  { id: 'settings', icon: Settings },
];

export default function App() {
  const [nav, setNav] = useState<NavSection>('dashboard');
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [recentImages, setRecentImages] = useState<GeneratedImage[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityLogEntry[]>([]);
  const [totalEstimatedCostUsd, setTotalEstimatedCostUsd] = useState(0);
  const [totalGeneratedImages, setTotalGeneratedImages] = useState(0);

  // Active project entities
  const [characters, setCharacters] = useState<Character[]>([]);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [screenplays, setScreenplays] = useState<Screenplay[]>([]);
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [shots, setShots] = useState<StoryboardShot[]>([]);
  const [images, setImages] = useState<GeneratedImage[]>([]);

  const [storyboardSceneId, setStoryboardSceneId] = useState<string | null>(null);
  const [genContext, setGenContext] = useState<GenerationContext | null>(null);
  const [inspectedImage, setInspectedImage] = useState<GeneratedImage | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    try {
      const [s, dash] = await Promise.all([api.getSettings(), api.getDashboard()]);
      setSettings(s);
      setProjects(dash.projects);
      setRecentImages(dash.recentImages);
      setRecentActivity(dash.recentActivity);
      setTotalEstimatedCostUsd(dash.totalEstimatedCostUsd);
      setTotalGeneratedImages(dash.totalGeneratedImages);

      const resolvedActiveId =
        dash.activeProjectId && dash.projects.some((p) => p.id === dash.activeProjectId)
          ? dash.activeProjectId
          : dash.projects[0]?.id ?? null;
      setActiveProjectId(resolvedActiveId);
      setBootError(null);
    } catch (err) {
      setBootError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadProjectEntities = useCallback(async (projectId: string | null) => {
    if (!projectId) {
      setCharacters([]);
      setOutfits([]);
      setLocations([]);
      setScreenplays([]);
      setScenes([]);
      setShots([]);
      setImages([]);
      return;
    }

    const [chars, outf, locs, sps, scs, shs, imgs] = await Promise.all([
      api.listCharacters(projectId),
      api.listOutfits(projectId),
      api.listLocations(projectId),
      api.listScreenplays(projectId),
      api.listScenes(projectId),
      api.listShots(projectId),
      api.listImages(projectId),
    ]);
    setCharacters(chars);
    setOutfits(outf);
    setLocations(locs);
    setScreenplays(sps);
    setScenes(scs);
    setShots(shs);
    setImages(imgs);
  }, []);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    loadProjectEntities(activeProjectId).catch(() => {});
  }, [activeProjectId, loadProjectEntities]);

  const refreshAll = useCallback(async () => {
    await loadWorkspace();
    if (activeProjectId) {
      await loadProjectEntities(activeProjectId);
    }
  }, [loadWorkspace, loadProjectEntities, activeProjectId]);

  const handleSelectProject = async (projectId: string) => {
    setActiveProjectId(projectId);
    if (settings) {
      const updated = await api.updateSettings({ activeProjectId: projectId });
      setSettings(updated);
    }
  };

  const handleToggleLanguage = async () => {
    if (!settings) return;
    const nextLang = settings.language === 'fr' ? 'en' : 'fr';
    const updated = await api.updateSettings({ language: nextLang });
    setSettings(updated);
  };

  if (bootError) {
    return (
      <div className="min-h-screen bg-[#0B0C0E] text-[#ECEEF2] flex items-center justify-center p-8">
        <div className="max-w-md bg-[#131519] border border-[#7F1D1D] rounded-lg p-6 space-y-3">
          <h1 className="font-display text-lg font-semibold text-[#FCA5A5]">
            Impossible de contacter le serveur local CineStudio AI
          </h1>
          <p className="text-xs text-[#C6CDD8]">{bootError}</p>
          <button
            type="button"
            onClick={() => loadWorkspace()}
            className="px-4 py-2 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen bg-[#0B0C0E] text-[#8E96A4] flex items-center justify-center text-sm">
        Initialisation de CineStudio AI...
      </div>
    );
  }

  const lang = settings.language;
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  return (
    <div className="min-h-screen bg-[#0B0C0E] text-[#ECEEF2] flex">
      {/* Permanent 12-Module Cinema Studio Sidebar */}
      <aside className="w-[248px] shrink-0 bg-[#101216] border-r border-[#262A33] flex flex-col justify-between h-screen sticky top-0">
        <div className="flex flex-col overflow-hidden">
          {/* Brand Wordmark */}
          <div className="h-14 px-5 border-b border-[#262A33] flex items-center gap-2.5 shrink-0">
            <Film className="w-5 h-5 text-[#C9A66B] shrink-0" />
            <span className="font-display text-base font-semibold tracking-tight text-[#ECEEF2] whitespace-nowrap">
              CineStudio AI
            </span>
          </div>

          {/* 12 Primary Modules */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = nav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setNav(item.id)}
                  className={`w-full px-3 py-2 rounded-md text-xs font-medium flex items-center gap-2.5 transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#1B1E24] text-[#ECEEF2]'
                      : 'text-[#8E96A4] hover:text-[#ECEEF2] hover:bg-[#15181E]'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${active ? 'text-[#C9A66B]' : 'text-[#6E7685]'}`}
                  />
                  <span className="truncate">{NAV_LABELS[lang][item.id]}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Quiet Local Storage Footer & Language Toggle */}
        <div className="p-3.5 border-t border-[#262A33] space-y-2.5 shrink-0">
          <div className="flex items-center justify-between text-[11px] text-[#7D8594]">
            <span className="truncate">{t(lang, 'localOnly')}</span>
            <button
              type="button"
              onClick={handleToggleLanguage}
              className="font-mono text-[#C6CDD8] hover:text-[#C9A66B] px-1.5 py-0.5 border border-[#262A33] rounded"
            >
              {lang === 'fr' ? 'FR' : 'EN'}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Clean Contextual Top Bar */}
        <header className="h-14 px-6 border-b border-[#262A33] bg-[#0E1014] flex items-center justify-between gap-6 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0 text-xs">
            <span className="text-[#8E96A4] whitespace-nowrap">{NAV_LABELS[lang][nav]}</span>
            <span className="text-[#3A404F]">/</span>
            {projects.length > 0 ? (
              <select
                value={activeProjectId ?? ''}
                onChange={(e) => handleSelectProject(e.target.value)}
                aria-label={t(lang, 'selectProject')}
                className="bg-[#131519] border border-[#262A33] rounded px-2.5 py-1 text-xs text-[#ECEEF2] max-w-[260px] truncate focus:outline-none focus:border-[#C9A66B]"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[#7D8594] truncate">{t(lang, 'noActiveProject')}</span>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeProject ? (
              <button
                type="button"
                onClick={() =>
                  setGenContext({
                    projectId: activeProject.id,
                    entityType: 'free',
                    title: `${activeProject.title} — Frame`,
                    initialPrompt: '',
                    defaultAspectRatio: activeProject.aspectRatio,
                  })
                }
                className="px-3.5 py-1.5 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {t(lang, 'generateImage')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setNav('projects')}
                className="px-3.5 py-1.5 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] whitespace-nowrap shrink-0"
              >
                {t(lang, 'newProject')}
              </button>
            )}
          </div>
        </header>

        {/* Active Module Viewport */}
        <main className="flex-1 p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {nav === 'dashboard' && (
            <DashboardView
              settings={settings}
              projects={projects}
              activeProject={activeProject}
              recentImages={recentImages}
              recentActivity={recentActivity}
              totalEstimatedCostUsd={totalEstimatedCostUsd}
              totalGeneratedImages={totalGeneratedImages}
              onSelectProject={handleSelectProject}
              onNavigate={setNav}
              onOpenNewProject={() => setNav('projects')}
              onInspectImage={setInspectedImage}
            />
          )}

          {nav === 'projects' && (
            <ProjectsView
              settings={settings}
              projects={projects}
              activeProjectId={activeProjectId}
              onSelectProject={handleSelectProject}
              onRefresh={refreshAll}
            />
          )}

          {nav === 'characters' && (
            <CharactersView
              settings={settings}
              project={activeProject}
              characters={characters}
              images={images}
              onRefresh={refreshAll}
              onOpenGenerate={setGenContext}
              onInspectImage={setInspectedImage}
            />
          )}

          {nav === 'outfits' && (
            <OutfitsView
              settings={settings}
              project={activeProject}
              characters={characters}
              outfits={outfits}
              images={images}
              onRefresh={refreshAll}
              onOpenGenerate={setGenContext}
              onInspectImage={setInspectedImage}
            />
          )}

          {nav === 'locations' && (
            <LocationsView
              settings={settings}
              project={activeProject}
              locations={locations}
              images={images}
              onRefresh={refreshAll}
              onOpenGenerate={setGenContext}
              onInspectImage={setInspectedImage}
            />
          )}

          {nav === 'screenplays' && (
            <ScreenplaysView
              settings={settings}
              project={activeProject}
              screenplays={screenplays}
              onRefresh={refreshAll}
            />
          )}

          {nav === 'scenes' && (
            <ScenesView
              settings={settings}
              project={activeProject}
              scenes={scenes}
              characters={characters}
              outfits={outfits}
              locations={locations}
              onRefresh={refreshAll}
              onOpenStoryboardForScene={(sceneId) => {
                setStoryboardSceneId(sceneId);
                setNav('storyboards');
              }}
            />
          )}

          {nav === 'storyboards' && (
            <StoryboardsView
              settings={settings}
              project={activeProject}
              scenes={scenes}
              shots={shots}
              characters={characters}
              outfits={outfits}
              locations={locations}
              images={images}
              initialSceneId={storyboardSceneId}
              onRefresh={refreshAll}
              onOpenGenerate={setGenContext}
              onInspectImage={setInspectedImage}
            />
          )}

          {nav === 'library' && (
            <LibraryView
              settings={settings}
              project={activeProject}
              images={images}
              onOpenGenerate={setGenContext}
              onInspectImage={setInspectedImage}
            />
          )}

          {nav === 'assistant' && (
            <AssistantView
              settings={settings}
              project={activeProject}
              onProjectDataChanged={refreshAll}
            />
          )}

          {nav === 'budget' && <BudgetView settings={settings} />}

          {nav === 'settings' && (
            <SettingsView settings={settings} onSettingsUpdated={setSettings} />
          )}
        </main>
      </div>

      {/* Unified Image Generation Engine Modal */}
      <GenerationStudioModal
        open={Boolean(genContext)}
        context={genContext}
        settings={settings}
        projectImages={images}
        onClose={() => setGenContext(null)}
        onGenerated={async () => {
          await refreshAll();
        }}
        onInspectImage={(img) => {
          setGenContext(null);
          setInspectedImage(img);
        }}
      />

      {/* Non-Destructive Image History, Comparison & Regional Retouch Modal */}
      <ImageInspectorModal
        image={inspectedImage}
        settings={settings}
        onClose={() => setInspectedImage(null)}
        onImageUpdated={async (updated) => {
          setInspectedImage(updated);
          await refreshAll();
        }}
      />
    </div>
  );
}
