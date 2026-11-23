import {
  CheckCircle2,
  Folder,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '../../shared/i18n.ts';
import type {
  AspectRatio,
  ImageModelId,
  ImageResolution,
  ModelPricingEntry,
  PromptTemplate,
  ProviderStatus,
  StudioSettings,
} from '../../shared/types.ts';
import { api } from '../../services/api.ts';

interface SettingsViewProps {
  settings: StudioSettings;
  onSettingsUpdated: (next: StudioSettings) => void;
}

export function SettingsView({ settings, onSettingsUpdated }: SettingsViewProps) {
  const lang = settings.language;
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    available: boolean;
    message: string;
    checkedAt: string;
  } | null>(null);

  const [draft, setDraft] = useState<StudioSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  // Reusable prompt templates state
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [tplName, setTplName] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [tplCat, setTplCat] = useState<PromptTemplate['category']>('storyboard');

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    api.getProviderStatus().then(setProvider).catch(() => {});
    api.listPromptTemplates().then(setTemplates).catch(() => {});
  }, []);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testProviderConnection();
      setTestResult(res);
      const refreshed = await api.getProviderStatus();
      setProvider(refreshed);
    } catch (err) {
      setTestResult({
        available: false,
        message: err instanceof Error ? err.message : String(err),
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    try {
      const updated = await api.updateSettings(draft);
      onSettingsUpdated(updated);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const updatePrice = (
    modelId: ImageModelId,
    resKey: ImageResolution,
    value: number
  ) => {
    const today = new Date().toISOString().slice(0, 10);
    setDraft((prev) => ({
      ...prev,
      pricingTable: prev.pricingTable.map((m): ModelPricingEntry =>
        m.modelId === modelId
          ? {
              ...m,
              pricePerImageUsd: { ...m.pricePerImageUsd, [resKey]: value },
              updatedAt: today,
            }
          : m
      ),
    }));
  };

  const handleAddTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplName.trim() || !tplBody.trim()) return;
    await api.createPromptTemplate({
      name: tplName.trim(),
      category: tplCat,
      promptBody: tplBody.trim(),
    });
    setTplName('');
    setTplBody('');
    setTemplates(await api.listPromptTemplates());
  };

  const sourceLabel = (src: ProviderStatus['source']) => {
    if (src === 'env') return lang === 'en' ? 'Server environment (AI Studio Secrets / .env)' : 'Variable serveur (AI Studio Secrets / .env)';
    if (src === 'keychain') return 'macOS Keychain (Trousseau d’accès)';
    if (src === 'local_file') return '~/.cinestudio-ai/credentials.json (chmod 0600)';
    return lang === 'en' ? 'Not configured' : 'Non configurée';
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[#ECEEF2]">
          {lang === 'en' ? 'Studio Settings' : 'Paramètres du Studio'}
        </h1>
        <p className="text-xs text-[#8E96A4] mt-1">
          {lang === 'en'
            ? 'Google Gemini connection verification, centralized model pricing, local storage path, and language.'
            : 'Vérification de la connexion Google Gemini, grille tarifaire centralisée, stockage local macOS et langue.'}
        </p>
      </div>

      {/* Section 1: Google Connection Verification (Server-Side Secret Architecture) */}
      <section className="p-6 bg-[#131519] border border-[#262A33] rounded-lg space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-base font-semibold text-[#ECEEF2] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#C9A66B]" />
              {lang === 'en' ? 'Google Gemini Connection' : 'Connexion Google'}
            </h2>
            <p className="text-xs text-[#8E96A4] max-w-2xl leading-relaxed">
              {lang === 'en'
                ? 'All Gemini API calls execute strictly on the local Node.js backend. Credentials are never stored in browser localStorage, never exposed in frontend code, and never bundled in ZIP exports.'
                : 'Toutes les requêtes Gemini transitent exclusivement par le backend Node.js local. La clé API n’est jamais exposée au navigateur, jamais stockée dans localStorage et jamais incluse dans les exports ZIP.'}
            </p>
          </div>
          <button
            type="button"
            disabled={testing}
            onClick={handleTestConnection}
            className="px-4 py-2 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E] disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            {testing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {t(lang, 'testConnection')}
          </button>
        </div>

        {provider && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4 border-y border-[#262A33] text-xs">
            <div>
              <div className="text-[#8E96A4]">{lang === 'en' ? 'Server Status' : 'État serveur'}</div>
              <div className="mt-1 flex items-center gap-1.5 font-medium text-[#ECEEF2]">
                {provider.configured ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#34D399]" />
                    {lang === 'en' ? 'Key detected on server' : 'Clé détectée côté serveur'}
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-[#F87171]" />
                    {t(lang, 'connectionMissing')}
                  </>
                )}
              </div>
            </div>
            <div>
              <div className="text-[#8E96A4]">{lang === 'en' ? 'Credential Source' : 'Source sécurisée'}</div>
              <div className="mt-1 text-[#C6CDD8]">{sourceLabel(provider.source)}</div>
            </div>
            <div>
              <div className="text-[#8E96A4]">{lang === 'en' ? 'Masked Reference' : 'Aperçu masqué'}</div>
              <div className="mt-1 font-mono text-[#ECEEF2]">
                {provider.maskedKeyPreview ?? '—'}
              </div>
            </div>
          </div>
        )}

        {testResult && (
          <div
            className={`p-3.5 rounded-md border text-xs flex items-start gap-2.5 ${
              testResult.available
                ? 'bg-[#122019] border-[#1E4631] text-[#6EE7B7]'
                : 'bg-[#2A1417] border-[#7F1D1D] text-[#FCA5A5]'
            }`}
          >
            {testResult.available ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="font-medium">
                {testResult.available ? t(lang, 'connectionActive') : t(lang, 'connectionError')}
              </div>
              <div className="mt-0.5 opacity-90">{testResult.message}</div>
            </div>
          </div>
        )}

        <div className="p-3.5 bg-[#0B0C0E] border border-[#262A33] rounded-md text-xs text-[#9CA3B2] space-y-1.5">
          <div className="font-medium text-[#ECEEF2]">
            {lang === 'en' ? 'How credentials are configured safely' : 'Configuration sécurisée de la clé Google'}
          </div>
          <p>
            • <strong className="text-[#C6CDD8]">Google AI Studio</strong> :{' '}
            {lang === 'en'
              ? 'Managed automatically via Settings > Secrets (GEMINI_API_KEY).'
              : 'Gérée automatiquement via Settings > Secrets (GEMINI_API_KEY).'}
          </p>
          <p>
            • <strong className="text-[#C6CDD8]">macOS (exécution locale)</strong> :{' '}
            {lang === 'en'
              ? 'Run ./scripts/setup-keychain-macos.sh in Terminal to store your key in macOS Keychain (or chmod 0600 fallback file).'
              : 'Exécutez ./scripts/setup-keychain-macos.sh dans Terminal pour enregistrer votre clé dans le Trousseau d’accès macOS (ou en fichier local protégé chmod 0600).'}
          </p>
        </div>
      </section>

      {/* Section 2: General Studio Preferences & Editable Pricing Table */}
      <form onSubmit={handleSaveSettings} className="space-y-6">
        <section className="p-6 bg-[#131519] border border-[#262A33] rounded-lg space-y-4">
          <h2 className="font-display text-base font-semibold text-[#ECEEF2] flex items-center gap-2">
            <Folder className="w-4 h-4 text-[#C9A66B]" />
            {lang === 'en' ? 'Local Storage, Defaults & Language' : 'Stockage local, préférences & langue'}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">
                {lang === 'en' ? 'Local Projects Root Folder' : 'Dossier principal des projets locaux'}
              </label>
              <input
                value={draft.projectsRoot}
                onChange={(e) => setDraft({ ...draft, projectsRoot: e.target.value })}
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs font-mono text-[#ECEEF2]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">
                {lang === 'en' ? 'Interface Language' : "Langue de l'interface"}
              </label>
              <select
                value={draft.language}
                onChange={(e) => setDraft({ ...draft, language: e.target.value as 'fr' | 'en' })}
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-3 py-2 text-xs text-[#ECEEF2]"
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">
                {lang === 'en' ? 'Default Image Model' : 'Modèle image par défaut'}
              </label>
              <select
                value={draft.defaultModel}
                onChange={(e) =>
                  setDraft({ ...draft, defaultModel: e.target.value as ImageModelId })
                }
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-2.5 py-2 text-xs font-mono text-[#ECEEF2]"
              >
                {draft.pricingTable.map((m) => (
                  <option key={m.modelId} value={m.modelId}>
                    {m.modelId}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">Format</label>
              <select
                value={draft.defaultAspectRatio}
                onChange={(e) =>
                  setDraft({ ...draft, defaultAspectRatio: e.target.value as AspectRatio })
                }
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-2.5 py-2 text-xs font-mono text-[#ECEEF2]"
              >
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
                <option value="4:5">4:5</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">
                {lang === 'en' ? 'Default Resolution' : 'Résolution par défaut'}
              </label>
              <select
                value={draft.defaultResolution}
                onChange={(e) =>
                  setDraft({ ...draft, defaultResolution: e.target.value as ImageResolution })
                }
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-2.5 py-2 text-xs font-mono text-[#ECEEF2]"
              >
                <option value="1K">1K</option>
                <option value="2K">2K</option>
                <option value="4K">4K</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#8E96A4] mb-1">
                {lang === 'en' ? 'Display Currency' : 'Devise d’affichage'}
              </label>
              <select
                value={draft.currency}
                onChange={(e) => setDraft({ ...draft, currency: e.target.value as 'USD' | 'EUR' })}
                className="w-full bg-[#0B0C0E] border border-[#262A33] rounded-md px-2.5 py-2 text-xs font-mono text-[#ECEEF2]"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
          </div>
        </section>

        {/* Editable & Dated Model Pricing Registry */}
        <section className="p-6 bg-[#131519] border border-[#262A33] rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-[#ECEEF2] flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#C9A66B]" />
                {lang === 'en'
                  ? 'Centralized Image Provider & Pricing Schedule (USD)'
                  : 'Registre centralisé des modèles & tarifs (USD)'}
              </h2>
              <p className="text-xs text-[#8E96A4] mt-0.5">
                {lang === 'en'
                  ? 'Update per-image cost estimates whenever Google adjusts official pricing.'
                  : 'Modifiez les tarifs indicatifs par image lorsque Google met à jour sa grille officielle.'}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {draft.pricingTable.map((m) => (
              <div
                key={m.modelId}
                className="p-4 bg-[#0B0C0E] border border-[#262A33] rounded-md space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-[#ECEEF2]">{m.label}</div>
                    <div className="text-xs font-mono text-[#8E96A4]">
                      {m.modelId} · {m.providerId} · MAJ {m.updatedAt}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {(['1K', '2K', '4K'] as ImageResolution[]).map((rk) => {
                      const supported = m.supportedResolutions.includes(rk);
                      return (
                        <div key={rk} className="flex items-center gap-1.5 text-xs">
                          <span className="font-mono text-[#8E96A4]">{rk}:</span>
                          <input
                            type="number"
                            step="0.005"
                            min="0"
                            disabled={!supported}
                            value={m.pricePerImageUsd[rk] ?? 0}
                            onChange={(e) => updatePrice(m.modelId, rk, Number(e.target.value) || 0)}
                            className="w-20 bg-[#131519] border border-[#262A33] rounded px-2 py-1 font-mono tabular-nums text-xs text-[#ECEEF2] disabled:opacity-35"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className="text-xs text-[#7D8594]">
                  {lang === 'en' ? m.descriptionEn : m.descriptionFr}
                </p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            {savedNotice && (
              <span className="text-xs text-[#34D399]">
                {lang === 'en' ? 'Settings saved locally.' : 'Paramètres enregistrés localement.'}
              </span>
            )}
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-xs font-medium bg-[#C9A66B] text-[#0B0C0E] rounded-md hover:bg-[#D6B77E]"
            >
              {saving ? t(lang, 'loading') : t(lang, 'save')}
            </button>
          </div>
        </section>
      </form>

      {/* Reusable Prompt Templates Manager */}
      <section className="p-6 bg-[#131519] border border-[#262A33] rounded-lg space-y-4">
        <h2 className="font-display text-base font-semibold text-[#ECEEF2]">
          {lang === 'en' ? 'Reusable Prompt Templates' : 'Modèles de prompts réutilisables'}
        </h2>
        <form onSubmit={handleAddTemplate} className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <input
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
            placeholder={lang === 'en' ? 'Template name' : 'Nom du modèle'}
            className="md:col-span-3 bg-[#0B0C0E] border border-[#262A33] rounded px-3 py-2 text-xs text-[#ECEEF2]"
          />
          <select
            value={tplCat}
            onChange={(e) => setTplCat(e.target.value as PromptTemplate['category'])}
            className="md:col-span-2 bg-[#0B0C0E] border border-[#262A33] rounded px-2.5 py-2 text-xs text-[#ECEEF2]"
          >
            <option value="character">Character</option>
            <option value="outfit">Outfit</option>
            <option value="location">Location</option>
            <option value="storyboard">Storyboard</option>
            <option value="general">General</option>
          </select>
          <input
            value={tplBody}
            onChange={(e) => setTplBody(e.target.value)}
            placeholder={lang === 'en' ? 'Cinematic prompt fragment...' : 'Fragment de prompt cinématographique...'}
            className="md:col-span-5 bg-[#0B0C0E] border border-[#262A33] rounded px-3 py-2 text-xs text-[#ECEEF2]"
          />
          <button
            type="submit"
            className="md:col-span-2 px-3 py-2 text-xs font-medium bg-[#1B1E24] border border-[#2C313C] text-[#ECEEF2] hover:border-[#C9A66B] rounded inline-flex items-center justify-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            {lang === 'en' ? 'Add' : 'Ajouter'}
          </button>
        </form>

        <div className="divide-y divide-[#262A33]">
          {templates.map((tpl) => (
            <div key={tpl.id} className="py-2.5 flex items-start justify-between gap-4 text-xs">
              <div>
                <div className="font-medium text-[#ECEEF2]">
                  {tpl.name} <span className="text-[#7D8594] font-mono">· {tpl.category}</span>
                </div>
                <p className="text-[#8E96A4] mt-0.5">{tpl.promptBody}</p>
              </div>
              {!tpl.isBuiltIn && (
                <button
                  type="button"
                  onClick={async () => {
                    await api.deletePromptTemplate(tpl.id);
                    setTemplates(await api.listPromptTemplates());
                  }}
                  className="p-1 text-[#7D8594] hover:text-[#F87171]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
