export type Language = 'fr' | 'en';

export type NavSection =
  | 'dashboard'
  | 'projects'
  | 'characters'
  | 'outfits'
  | 'locations'
  | 'screenplays'
  | 'scenes'
  | 'storyboards'
  | 'library'
  | 'assistant'
  | 'budget'
  | 'settings';

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';
export type ImageResolution = '1K' | '2K' | '4K';

export type ImageModelId =
  | 'gemini-nano-banana-2.1'
  | 'gemini-3-pro-image'
  | 'gemini-3.1-flash-lite-image';

export interface ModelPricingEntry {
  modelId: ImageModelId;
  providerId: string;
  label: string;
  tier: 'primary' | 'premium' | 'economy';
  descriptionFr: string;
  descriptionEn: string;
  supportedResolutions: ImageResolution[];
  supportsReferenceImages: boolean;
  supportsPixelMask: boolean;
  pricePerImageUsd: Record<ImageResolution, number>;
  notesFr: string;
  notesEn: string;
  updatedAt: string;
}

export interface StudioSettings {
  language: Language;
  projectsRoot: string;
  defaultModel: ImageModelId;
  defaultAspectRatio: AspectRatio;
  defaultResolution: ImageResolution;
  currency: 'USD' | 'EUR';
  eurExchangeRate: number;
  activeProjectId: string | null;
  pricingTable: ModelPricingEntry[];
}

export interface ProviderStatus {
  providerId: string;
  providerName: string;
  configured: boolean;
  source: 'env' | 'keychain' | 'local_file' | 'none';
  maskedKeyPreview: string | null;
  lastCheckedAt: string | null;
  connectionOk: boolean | null;
  connectionMessage: string | null;
  models: ModelPricingEntry[];
  textModel: string;
  requiresInternet: boolean;
}

export interface Project {
  id: string;
  slug: string;
  title: string;
  logline: string;
  genre: string;
  director: string;
  aspectRatio: AspectRatio;
  visualTone: string;
  status: 'prep' | 'casting' | 'storyboarding' | 'completed';
  folderPath: string;
  createdAt: string;
  updatedAt: string;
  counts?: {
    characters: number;
    outfits: number;
    locations: number;
    screenplays: number;
    scenes: number;
    shots: number;
    images: number;
  };
}

export interface Character {
  id: string;
  projectId: string;
  slug: string;
  name: string;
  role: string;
  apparentAge: string;
  gender: string;
  originAndTraits: string;
  height: string;
  build: string;
  skinTone: string;
  faceShape: string;
  eyes: string;
  hair: string;
  hairstyle: string;
  facialHair: string;
  physicalMarks: string;
  personality: string;
  expressions: string;
  visualParticularities: string;
  freeDescription: string;
  identityLocked: boolean;
  officialReferenceIds: string[];
  primaryImageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type OutfitCategory =
  | 'daily'
  | 'professional'
  | 'traditional'
  | 'sport'
  | 'evening'
  | 'scene_specific';

export interface Outfit {
  id: string;
  projectId: string;
  characterId: string;
  name: string;
  category: OutfitCategory;
  description: string;
  fabricsAndColors: string;
  accessories: string;
  sceneNotes: string;
  referenceImageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type LocationType =
  | 'house'
  | 'apartment'
  | 'street'
  | 'restaurant'
  | 'office'
  | 'school'
  | 'hospital'
  | 'forest'
  | 'beach'
  | 'city'
  | 'village'
  | 'interior_set'
  | 'exterior_set';

export interface LocationItem {
  id: string;
  projectId: string;
  slug: string;
  name: string;
  description: string;
  locationType: LocationType;
  settingRealOrFictional: string;
  ambiance: string;
  lighting: string;
  architecture: string;
  colorPalette: string;
  referenceImageIds: string[];
  primaryImageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScreenplayAnalysis {
  summary: string;
  detectedCharacters: Array<{
    name: string;
    role: string;
    description: string;
  }>;
  detectedLocations: Array<{
    name: string;
    type: LocationType;
    ambiance: string;
    lighting: string;
    description: string;
  }>;
  proposedScenes: Array<{
    title: string;
    locationName: string;
    timeOfDay: string;
    characters: string[];
    actions: string;
    dialogues: string;
    emotions: string;
    ambiance: string;
    lighting: string;
    framing: string;
    visualGoal: string;
  }>;
  keyMoments: string[];
  temporalCues: string[];
}

export interface Screenplay {
  id: string;
  projectId: string;
  title: string;
  sourceFilename: string | null;
  sourceFormat: 'txt' | 'pdf' | 'docx' | 'pasted';
  originalText: string;
  workingText: string;
  analysis: ScreenplayAnalysis | null;
  createdAt: string;
  updatedAt: string;
}

export interface SceneItem {
  id: string;
  projectId: string;
  screenplayId: string | null;
  sortOrder: number;
  title: string;
  description: string;
  locationId: string | null;
  locationName: string;
  timeOfDay: string;
  characterIds: string[];
  outfitAssignments: Record<string, string>; // characterId -> outfitId
  actions: string;
  dialogues: string;
  emotions: string;
  ambiance: string;
  lighting: string;
  framing: string;
  visualGoal: string;
  createdAt: string;
  updatedAt: string;
}

export type CameraFraming =
  | 'extreme_close_up'
  | 'close_up'
  | 'medium_close_up'
  | 'cowboy_shot'
  | 'medium_shot'
  | 'wide_shot'
  | 'establishing_shot'
  | 'pov';

export interface StoryboardShot {
  id: string;
  projectId: string;
  sceneId: string;
  shotNumber: number;
  sortOrder: number;
  actionDescription: string;
  visibleCharacterIds: string[];
  expression: string;
  pose: string;
  outfitNotes: string;
  locationId: string | null;
  framing: CameraFraming;
  cameraAngle: string;
  composition: string;
  lighting: string;
  ambiance: string;
  durationSec: number;
  prompt: string;
  officialImageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ImageEntityType =
  | 'character_portrait'
  | 'character_fullbody'
  | 'character_turnaround'
  | 'character_expression'
  | 'character_pose'
  | 'outfit'
  | 'location'
  | 'storyboard_shot'
  | 'free';

export interface ImageVersion {
  id: string;
  imageId: string;
  versionNumber: number;
  parentVersionId: string | null;
  filePath: string;
  url: string;
  mimeType: string;
  prompt: string;
  modelId: ImageModelId;
  aspectRatio: AspectRatio;
  resolution: ImageResolution;
  paramsJson: Record<string, unknown>;
  referenceImageIds: string[];
  editInstruction: string | null;
  maskUsed: boolean;
  estimatedCostUsd: number;
  usageTokens: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  } | null;
  isRestoredFrom: string | null;
  createdAt: string;
}

export interface GeneratedImage {
  id: string;
  projectId: string;
  entityType: ImageEntityType;
  entityId: string | null;
  title: string;
  officialVersionId: string | null;
  officialVersion?: ImageVersion | null;
  versions?: ImageVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  category: 'character' | 'outfit' | 'location' | 'storyboard' | 'general';
  promptBody: string;
  defaultFraming: string;
  defaultLighting: string;
  isBuiltIn: boolean;
  createdAt: string;
}

export interface CostEstimate {
  providerId: string;
  modelId: ImageModelId;
  modelLabel: string;
  resolution: ImageResolution;
  aspectRatio: AspectRatio;
  effectiveApiAspectRatio: string;
  aspectRatioNote: string | null;
  variantCount: number;
  unitCostUsd: number;
  totalCostUsd: number;
  displayCurrency: 'USD' | 'EUR';
  unitCostDisplay: number;
  totalCostDisplay: number;
  additionalCostsNote: string;
  pricingUpdatedAt: string;
  requiresInternet: true;
}

export interface CostLogEntry {
  id: string;
  projectId: string | null;
  projectTitle?: string;
  operation: 'generate' | 'edit';
  providerId: string;
  modelId: ImageModelId;
  resolution: ImageResolution;
  aspectRatio: AspectRatio;
  imageCount: number;
  estimatedCostUsd: number;
  currency: string;
  actualCostKnown: boolean;
  actualCostUsd: number | null;
  usageTokens: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  } | null;
  notes: string | null;
  createdAt: string;
}

export interface ActivityLogEntry {
  id: string;
  projectId: string | null;
  module: string;
  action: string;
  details: string;
  createdAt: string;
}

export interface AssistantProposal {
  id: string;
  actionType:
    | 'create_character'
    | 'create_location'
    | 'create_scene'
    | 'create_outfit'
    | 'propose_storyboard'
    | 'prepare_prompts'
    | 'none';
  summary: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'executed' | 'dismissed';
}

export interface AssistantMessage {
  id: string;
  projectId: string;
  role: 'user' | 'assistant';
  content: string;
  proposal: AssistantProposal | null;
  createdAt: string;
}
