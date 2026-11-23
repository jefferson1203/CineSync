import type {
  ActivityLogEntry,
  AspectRatio,
  AssistantMessage,
  Character,
  CostEstimate,
  CostLogEntry,
  GeneratedImage,
  ImageEntityType,
  ImageModelId,
  ImageResolution,
  LocationItem,
  Outfit,
  Project,
  PromptTemplate,
  ProviderStatus,
  SceneItem,
  Screenplay,
  StoryboardShot,
  StudioSettings,
} from '../shared/types.ts';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: options?.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    let message = `Erreur HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // keep status message
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export const api = {
  // Settings & Provider
  getSettings: () => request<StudioSettings>('/api/settings'),
  updateSettings: (payload: Partial<StudioSettings>) =>
    request<StudioSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  getProviderStatus: () => request<ProviderStatus>('/api/provider/status'),
  testProviderConnection: () =>
    request<{ available: boolean; message: string; checkedAt: string; verifiedModels: string[] }>(
      '/api/provider/test',
      { method: 'POST' }
    ),

  // Dashboard
  getDashboard: () =>
    request<{
      projects: Project[];
      activeProjectId: string | null;
      recentImages: GeneratedImage[];
      recentActivity: ActivityLogEntry[];
      totalEstimatedCostUsd: number;
      totalGeneratedImages: number;
    }>('/api/dashboard'),

  // Projects
  listProjects: () => request<Project[]>('/api/projects'),
  createProject: (payload: Partial<Project>) =>
    request<Project>('/api/projects', { method: 'POST', body: JSON.stringify(payload) }),
  updateProject: (id: string, payload: Partial<Project>) =>
    request<Project>(`/api/projects/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteProject: (id: string) =>
    request<{ ok: boolean }>(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  backupProject: (id: string) =>
    request<{ ok: boolean; folderPath: string; savedAt: string }>(
      `/api/projects/${encodeURIComponent(id)}/backup`,
      { method: 'POST' }
    ),
  importProjectZip: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<Project>('/api/projects/import-zip', { method: 'POST', body: fd });
  },

  // Characters
  listCharacters: (projectId: string) =>
    request<Character[]>(`/api/projects/${encodeURIComponent(projectId)}/characters`),
  enrichCharacter: (freeDescription: string) =>
    request<Partial<Character>>('/api/characters/ai-enrich', {
      method: 'POST',
      body: JSON.stringify({ freeDescription }),
    }),
  createCharacter: (projectId: string, payload: Partial<Character>) =>
    request<Character>(`/api/projects/${encodeURIComponent(projectId)}/characters`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateCharacter: (id: string, payload: Partial<Character>) =>
    request<Character>(`/api/characters/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteCharacter: (id: string) =>
    request<{ ok: boolean }>(`/api/characters/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Outfits
  listOutfits: (projectId: string) =>
    request<Outfit[]>(`/api/projects/${encodeURIComponent(projectId)}/outfits`),
  createOutfit: (projectId: string, payload: Partial<Outfit>) =>
    request<Outfit>(`/api/projects/${encodeURIComponent(projectId)}/outfits`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateOutfit: (id: string, payload: Partial<Outfit>) =>
    request<Outfit>(`/api/outfits/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteOutfit: (id: string) =>
    request<{ ok: boolean }>(`/api/outfits/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Locations
  listLocations: (projectId: string) =>
    request<LocationItem[]>(`/api/projects/${encodeURIComponent(projectId)}/locations`),
  createLocation: (projectId: string, payload: Partial<LocationItem>) =>
    request<LocationItem>(`/api/projects/${encodeURIComponent(projectId)}/locations`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateLocation: (id: string, payload: Partial<LocationItem>) =>
    request<LocationItem>(`/api/locations/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteLocation: (id: string) =>
    request<{ ok: boolean }>(`/api/locations/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Screenplays
  listScreenplays: (projectId: string) =>
    request<Screenplay[]>(`/api/projects/${encodeURIComponent(projectId)}/screenplays`),
  createScreenplayText: (projectId: string, title: string, text: string) =>
    request<Screenplay>(`/api/projects/${encodeURIComponent(projectId)}/screenplays`, {
      method: 'POST',
      body: JSON.stringify({ title, text }),
    }),
  uploadScreenplayFile: (projectId: string, file: File, title?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    if (title) fd.append('title', title);
    return request<Screenplay>(`/api/projects/${encodeURIComponent(projectId)}/screenplays/upload`, {
      method: 'POST',
      body: fd,
    });
  },
  updateScreenplayWorkingCopy: (id: string, payload: { title?: string; workingText?: string }) =>
    request<Screenplay>(`/api/screenplays/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  analyzeScreenplay: (id: string) =>
    request<Screenplay>(`/api/screenplays/${encodeURIComponent(id)}/analyze`, { method: 'POST' }),
  applyScreenplayAnalysis: (
    id: string,
    options: { importCharacters: boolean; importLocations: boolean; importScenes: boolean }
  ) =>
    request<{ createdChars: number; createdLocs: number; createdScenes: number }>(
      `/api/screenplays/${encodeURIComponent(id)}/apply-analysis`,
      { method: 'POST', body: JSON.stringify(options) }
    ),
  deleteScreenplay: (id: string) =>
    request<{ ok: boolean }>(`/api/screenplays/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Scenes
  listScenes: (projectId: string) =>
    request<SceneItem[]>(`/api/projects/${encodeURIComponent(projectId)}/scenes`),
  proposeScene: (projectId: string, description: string) =>
    request<Partial<SceneItem>>(`/api/projects/${encodeURIComponent(projectId)}/scenes/ai-propose`, {
      method: 'POST',
      body: JSON.stringify({ description }),
    }),
  createScene: (projectId: string, payload: Partial<SceneItem>) =>
    request<SceneItem>(`/api/projects/${encodeURIComponent(projectId)}/scenes`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateScene: (id: string, payload: Partial<SceneItem>) =>
    request<SceneItem>(`/api/scenes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteScene: (id: string) =>
    request<{ ok: boolean }>(`/api/scenes/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Storyboards
  listShots: (projectId: string, sceneId?: string) =>
    request<StoryboardShot[]>(
      `/api/projects/${encodeURIComponent(projectId)}/shots${
        sceneId ? `?sceneId=${encodeURIComponent(sceneId)}` : ''
      }`
    ),
  proposeStoryboard: (sceneId: string, desiredShotCount?: number) =>
    request<{ sceneId: string; proposedShots: Array<Partial<StoryboardShot>> }>(
      `/api/scenes/${encodeURIComponent(sceneId)}/shots/ai-propose`,
      { method: 'POST', body: JSON.stringify({ desiredShotCount }) }
    ),
  createShot: (projectId: string, payload: Partial<StoryboardShot>) =>
    request<StoryboardShot>(`/api/projects/${encodeURIComponent(projectId)}/shots`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateShot: (id: string, payload: Partial<StoryboardShot>) =>
    request<StoryboardShot>(`/api/shots/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  duplicateShot: (id: string) =>
    request<StoryboardShot>(`/api/shots/${encodeURIComponent(id)}/duplicate`, { method: 'POST' }),
  reorderShots: (sceneId: string, orderedIds: string[]) =>
    request<{ ok: boolean }>(`/api/scenes/${encodeURIComponent(sceneId)}/shots/reorder`, {
      method: 'POST',
      body: JSON.stringify({ orderedIds }),
    }),
  deleteShot: (id: string) =>
    request<{ ok: boolean }>(`/api/shots/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Images & Versions
  listImages: (projectId: string, entityId?: string) =>
    request<GeneratedImage[]>(
      `/api/projects/${encodeURIComponent(projectId)}/images${
        entityId ? `?entityId=${encodeURIComponent(entityId)}` : ''
      }`
    ),
  estimateImageCost: (payload: {
    modelId: ImageModelId;
    resolution: ImageResolution;
    aspectRatio: AspectRatio;
    variantCount: number;
  }) => request<CostEstimate>('/api/images/estimate', { method: 'POST', body: JSON.stringify(payload) }),
  generateImages: (payload: {
    projectId: string;
    prompt: string;
    modelId: ImageModelId;
    aspectRatio: AspectRatio;
    resolution: ImageResolution;
    variantCount: number;
    entityType: ImageEntityType;
    entityId?: string | null;
    characterSlug?: string | null;
    title: string;
    referenceImageIds?: string[];
    expertParams?: Record<string, unknown>;
    confirmed: true;
  }) =>
    request<{ images: GeneratedImage[]; estimate: CostEstimate }>('/api/images/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  editImage: (
    imageId: string,
    payload: {
      instruction: string;
      baseVersionId?: string | null;
      modelId: ImageModelId;
      resolution: ImageResolution;
      region?: { xPct: number; yPct: number; widthPct: number; heightPct: number } | null;
      referenceImageIds?: string[];
      confirmed: true;
    }
  ) =>
    request<{ image: GeneratedImage; limitationNotice: string | null }>(
      `/api/images/${encodeURIComponent(imageId)}/edit`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),
  setOfficialVersion: (imageId: string, versionId: string) =>
    request<GeneratedImage>(`/api/images/${encodeURIComponent(imageId)}/set-official`, {
      method: 'POST',
      body: JSON.stringify({ versionId }),
    }),
  restoreImageVersion: (imageId: string, versionId: string) =>
    request<GeneratedImage>(`/api/images/${encodeURIComponent(imageId)}/restore`, {
      method: 'POST',
      body: JSON.stringify({ versionId }),
    }),
  duplicateImageVersion: (imageId: string, versionId: string) =>
    request<GeneratedImage>(`/api/images/${encodeURIComponent(imageId)}/duplicate-version`, {
      method: 'POST',
      body: JSON.stringify({ versionId }),
    }),
  deleteImageVersion: (imageId: string, versionId: string) =>
    request<{ deletedImage: boolean; image?: GeneratedImage }>(
      `/api/images/${encodeURIComponent(imageId)}/versions/${encodeURIComponent(versionId)}`,
      { method: 'DELETE' }
    ),

  // Prompt Templates
  listPromptTemplates: () => request<PromptTemplate[]>('/api/prompt-templates'),
  createPromptTemplate: (payload: Partial<PromptTemplate>) =>
    request<PromptTemplate>('/api/prompt-templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deletePromptTemplate: (id: string) =>
    request<{ ok: boolean }>(`/api/prompt-templates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  // Budget
  getBudget: () =>
    request<{
      logs: CostLogEntry[];
      totalEstimatedUsd: number;
      totalImages: number;
      byModel: Array<{ modelId: string; totalImages: number; totalEstimatedUsd: number }>;
    }>('/api/budget'),

  // Central AI Assistant
  listAssistantMessages: (projectId: string) =>
    request<AssistantMessage[]>(`/api/projects/${encodeURIComponent(projectId)}/assistant`),
  sendAssistantMessage: (projectId: string, message: string) =>
    request<AssistantMessage>(`/api/projects/${encodeURIComponent(projectId)}/assistant/chat`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  executeAssistantProposal: (projectId: string, messageId: string) =>
    request<{ ok: boolean; summary: string }>(
      `/api/projects/${encodeURIComponent(projectId)}/assistant/proposals/${encodeURIComponent(
        messageId
      )}/execute`,
      { method: 'POST' }
    ),
  dismissAssistantProposal: (projectId: string, messageId: string) =>
    request<{ ok: boolean }>(
      `/api/projects/${encodeURIComponent(projectId)}/assistant/proposals/${encodeURIComponent(
        messageId
      )}/dismiss`,
      { method: 'POST' }
    ),
};
