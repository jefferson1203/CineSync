import type {
  AspectRatio,
  CostEstimate,
  ImageModelId,
  ImageResolution,
  ModelPricingEntry,
  StudioSettings,
} from '../../src/shared/types.ts';

export interface ReferenceImageInput {
  id: string;
  label: string;
  mimeType: string;
  base64Data: string;
}

export interface RegionSelection {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}

export interface GenerateImagesRequest {
  modelId: ImageModelId;
  prompt: string;
  aspectRatio: AspectRatio;
  resolution: ImageResolution;
  variantCount: number;
  references?: ReferenceImageInput[];
  enforceCinematicRealism?: boolean;
}

export interface EditImageRequest {
  modelId: ImageModelId;
  sourceImageBase64: string;
  sourceMimeType: string;
  instruction: string;
  aspectRatio: AspectRatio;
  resolution: ImageResolution;
  region?: RegionSelection | null;
  references?: ReferenceImageInput[];
}

export interface GeneratedImageOutput {
  buffer: Buffer;
  mimeType: string;
  modelNotes: string | null;
  usageTokens: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  } | null;
}

export interface ProviderAvailabilityResult {
  available: boolean;
  message: string;
  checkedAt: string;
  verifiedModels: string[];
}

/**
 * Provider-agnostic image provider interface.
 * Future image backends (e.g., Flux, Imagen Vertex, local engines) implement this
 * contract without requiring changes in Characters, Outfits, Locations, or Storyboards.
 */
export interface ImageProvider {
  readonly id: string;
  readonly name: string;
  listModels(settings: StudioSettings): ModelPricingEntry[];
  checkAvailability(): Promise<ProviderAvailabilityResult>;
  estimateCost(params: {
    modelId: ImageModelId;
    resolution: ImageResolution;
    aspectRatio: AspectRatio;
    variantCount: number;
    settings: StudioSettings;
  }): CostEstimate;
  generateImages(req: GenerateImagesRequest, settings: StudioSettings): Promise<{
    outputs: GeneratedImageOutput[];
    effectivePrompt: string;
    effectiveResolution: ImageResolution;
    effectiveApiAspectRatio: string;
  }>;
  editImage(req: EditImageRequest, settings: StudioSettings): Promise<{
    output: GeneratedImageOutput;
    effectivePrompt: string;
    effectiveResolution: ImageResolution;
    usedPixelMask: boolean;
    limitationNotice: string | null;
  }>;
}
