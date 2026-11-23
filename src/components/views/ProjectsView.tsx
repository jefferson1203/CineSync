import {
  Archive,
  Check,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { t } from '../../shared/i18n.ts';
import type { AspectRatio, Project, StudioSettings } from '../../shared/types.ts';
import { api } from '../../services/api.ts';

interface ProjectsViewProps {
  settings: StudioSettings;
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onRefresh: () => Promise<void>;
}

export function ProjectsView({
  settings,
  projects,
  activeProjectId,
  onSelectProject,
  onRefresh,
}: ProjectsViewProps) {
  const lang = settings.language;
  const [showForm, setShowForm] = useState(projects.length === 0);
  const [title, setTitle] = useState('');
  const [logline, setLogline] = useState('');
  const [genre, setGenre] = useState('Drame cinématographique');
  const [director, setDirector] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(settings.defaultAspectRatio);
  const [visualTone, setVisualTone] = useState(
    '35mm anamorphique, lumière naturelle motivée, colorimétrie cinéma sobre'
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const created = await api.createProject({
        title: title.trim(),
        logline: logline.trim(),
        genre: genre.trim(),
        director: director.trim(),
        aspectRatio,
        visualTone: visualTone.trim(),
      });
      setTitle('');
      setLogline('');
      setShowForm(false);
      await onRefresh();
      onSelectProject(created.id);
      setMessage(
        lang === 'en'
          ? `Project folder created at ${created.folderPath}`
          : `Dossier local créé : ${created.folderPath}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleBackup = async (project: Project) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.backupProject(project.id);
      setMessage(
        lang === 'en'
          ? `Disk snapshot saved (${res.folderPath}/project.json)`
          : `Sauvegarde locale synchronisée (${res.folderPath}/project.json)`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (project: Project) => {
    setBusy(true);
    try {
      await api.deleteProject(project.id);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleImportZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const imported = await api.importProjectZip(file);
      await onRefresh();
      onSelectProject(imported.id);
      setMessage(
        lang === 'en'
          ? `Project imported from ZIP: ${imported.title}`
          : `Projet importé depuis le ZIP : ${imported.title}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (zipInputRef.current) zipInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#ECEEF2]">
            {lang === 'en' ? 'Local Film Projects' : 'Projets cinématographiques locaux'}
          </h1>
          <p className="text-xs text-[#8E96A4] font-mono mt-1">
            {lang === 'en' ? 'Root directory' : 'Dossier principal'} : {settings.projectsRoot}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <input
            ref={zipInputRef}
            type="file"
            accept=".zip"
            onChange={handleImportZip}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => zipInputRef.current?.click()}
            disabled={busy}
            className="px-3.5 py-2 text-xs bg-[#131519] border border-[#262A33] text-[#C6CDD8] hover:text-[#ECEEF2] rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            {t(lang, 'importZip')}
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="px-4 py-2 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <FolderPlus className="w-4 h-4" />
            {t(lang, 'newProject')}
          </button>
        </div>
      </div>

      {message && (
        <div className="p-3.5 bg-[#122019] border border-[#1E4631] rounded-md text-xs text-[#6EE7B7]">
          {message}
        </div>
      )}
      {error && (
        <div className="p-3.5 bg-[#2A1417] border border-[#7F1D1D] rounded-md text-xs text-[#FCA5A5]">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="p-6 bg-[#131519] border border-[#262A33] rounded-lg space-y-4"
        >
          <h2 className="font-display text-base font-semibold text-[#ECEEF2]">
            {lang === 'en' ? 'Create New Film Production' : 'Créer une nouvelle production'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1.5">
                {lang === 'en' ? 'Project Title *' : 'Titre du film / projet *'}
              </label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ex. Nuit sur Marseille"
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-sm text-[#ECEEF2] focus:outline-none focus:border-[#C9A66B]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1.5">
                {lang === 'en' ? 'Genre' : 'Genre'}
              </label>
              <input
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-sm text-[#ECEEF2]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1.5">
                {lang === 'en' ? 'Director' : 'Réalisateur'}
              </label>
              <input
                value={director}
                onChange={(e) => setDirector(e.target.value)}
                placeholder="Nom du réalisateur"
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-sm text-[#ECEEF2]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs text-[#8E96A4] mb-1.5">Logline / Synopsis court</label>
              <textarea
                rows={2}
                value={logline}
                onChange={(e) => setLogline(e.target.value)}
                placeholder="Résumé dramatique du film ou court-métrage..."
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-sm text-[#ECEEF2]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1.5">
                {lang === 'en' ? 'Default Aspect Ratio' : 'Format principal'}
              </label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-sm font-mono text-[#ECEEF2]"
              >
                <option value="16:9">16:9 (Cinéma HD / Scope)</option>
                <option value="9:16">9:16 (Vertical)</option>
                <option value="1:1">1:1 (Carré)</option>
                <option value="4:5">4:5 (Portrait)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#8E96A4] mb-1.5">
              {lang === 'en' ? 'Visual Direction & Color Tone' : 'Direction photographique & colorimétrie'}
            </label>
            <input
              value={visualTone}
              onChange={(e) => setVisualTone(e.target.value)}
              className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-sm text-[#ECEEF2]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-xs text-[#A6AEBC] hover:text-[#ECEEF2]"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] inline-flex items-center gap-2"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {lang === 'en' ? 'Create Project & Folders' : 'Créer le projet et l’arborescence'}
            </button>
          </div>
        </form>
      )}

      {/* Projects List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {projects.map((p) => {
          const isActive = p.id === activeProjectId;
          return (
            <div
              key={p.id}
              className={`p-5 bg-[#131519] border rounded-lg space-y-4 transition-colors ${
                isActive ? 'border-[#C9A66B]' : 'border-[#262A33]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-[#8E96A4]">
                    {p.genre || 'Cinéma'} · <span className="font-mono">{p.aspectRatio}</span>
                    {isActive && (
                      <span className="text-[#C9A66B] font-medium">
                        {' '}
                        · {lang === 'en' ? 'Active' : 'Actif'}
                      </span>
                    )}
                  </div>
                  <h3 className="font-display text-lg font-semibold text-[#ECEEF2] mt-1 truncate">
                    {p.title}
                  </h3>
                  {p.logline && (
                    <p className="text-xs text-[#9CA3B2] mt-1.5 line-clamp-2 leading-relaxed">
                      {p.logline}
                    </p>
                  )}
                </div>
                {!isActive ? (
                  <button
                    type="button"
                    onClick={() => onSelectProject(p.id)}
                    className="px-3 py-1.5 text-xs bg-[#1B1E24] text-[#ECEEF2] hover:bg-[#262A33] rounded-md inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    {lang === 'en' ? 'Open' : 'Ouvrir'}
                  </button>
                ) : (
                  <span className="text-xs text-[#C9A66B] inline-flex items-center gap-1 shrink-0 pt-1">
                    <Check className="w-3.5 h-3.5" />
                    {lang === 'en' ? 'Selected' : 'Ouvert'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-4 gap-2 py-3 border-y border-[#262A33] text-xs font-mono tabular-nums">
                <div>
                  <span className="text-[#7D8594] block font-sans">{t(lang, 'characters')}</span>
                  <span className="text-[#ECEEF2]">{p.counts?.characters ?? 0}</span>
                </div>
                <div>
                  <span className="text-[#7D8594] block font-sans">{t(lang, 'locations')}</span>
                  <span className="text-[#ECEEF2]">{p.counts?.locations ?? 0}</span>
                </div>
                <div>
                  <span className="text-[#7D8594] block font-sans">{t(lang, 'scenes')}</span>
                  <span className="text-[#ECEEF2]">{p.counts?.scenes ?? 0}</span>
                </div>
                <div>
                  <span className="text-[#7D8594] block font-sans">{t(lang, 'images')}</span>
                  <span className="text-[#ECEEF2]">{p.counts?.images ?? 0}</span>
                </div>
              </div>

              <div className="text-[11px] font-mono text-[#6E7685] truncate">{p.folderPath}</div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleBackup(p)}
                    className="px-2.5 py-1.5 text-xs bg-[#0B0C0E] border border-[#262A33] text-[#C6CDD8] hover:text-[#ECEEF2] rounded inline-flex items-center gap-1.5"
                  >
                    <HardDrive className="w-3.5 h-3.5" />
                    {t(lang, 'backupNow')}
                  </button>
                  <a
                    href={`/api/projects/${encodeURIComponent(p.id)}/export-zip`}
                    className="px-2.5 py-1.5 text-xs bg-[#0B0C0E] border border-[#262A33] text-[#C6CDD8] hover:text-[#ECEEF2] rounded inline-flex items-center gap-1.5"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    {t(lang, 'exportZip')}
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(p)}
                  className="p-1.5 text-[#7D8594] hover:text-[#F87171] rounded"
                  title={t(lang, 'delete')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
