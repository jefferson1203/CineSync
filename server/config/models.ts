import type { AspectRatio, ImageModelId, ImageResolution, ModelPricingEntry } from '../../src/shared/types.ts';

/**
 * Centralized provider & model registry.
 * Never hardcode model IDs in UI or feature routes — always reference this file.
 */
export const GEMINI_TEXT_MODEL = 'gemini-4-hydrogen';

export const DEFAULT_IMAGE_MODELS: ModelPricingEntry[] = [
  {
    modelId: 'gemini-nano-banana-2.1',
    providerId: 'google-gemini',
    label: 'Gemini Nano Banana 2.1 (Principal)',
    tier: 'primary',
    descriptionFr:
      'Modèle principal recommandé : photoréalisme cinématographique, références visuelles multi-images et résolutions 1K, 2K et 4K.',
    descriptionEn:
      'Primary recommended model: cinematic photorealism, multi-image visual references, and 1K, 2K, and 4K resolutions.',
    supportedResolutions: ['1K', '2K', '4K'],
    supportsReferenceImages: true,
    supportsPixelMask: false,
    pricePerImageUsd: {
      '1K': 0.04,
      '2K': 0.08,
      '4K': 0.14,
    },
    notesFr:
      'Prend en charge les références visuelles et la retouche guidée. Les tarifs ci-dessus sont indicatifs et modifiables dans Paramètres.',
    notesEn:
      'Supports visual reference images and guided editing. Rates shown are estimates and editable in Settings.',
    updatedAt: '2026-11-01',
  },
  {
    modelId: 'gemini-3-pro-image',
    providerId: 'google-gemini',
    label: 'Gemini 3 Pro Image (Premium)',
    tier: 'premium',
    descriptionFr:
      'Modèle haute fidélité pour plans complexes, textures de peau ultra-naturelles, éclairages cinéma nuancés et résolutions jusqu’à 4K.',
    descriptionEn:
      'High-fidelity model for complex scenes, natural skin textures, nuanced cinema lighting, and up to 4K resolution.',
    supportedResolutions: ['1K', '2K', '4K'],
    supportsReferenceImages: true,
    supportsPixelMask: false,
    pricePerImageUsd: {
      '1K': 0.07,
      '2K': 0.13,
      '4K': 0.24,
    },
    notesFr:
      'Idéal pour les planches de référence officielles et plans clés du storyboard. Tarifs indicatifs modifiables.',
    notesEn:
      'Ideal for official character sheets and hero storyboard frames. Editable estimate rates.',
    updatedAt: '2026-11-01',
  },
  {
    modelId: 'gemini-3.1-flash-lite-image',
    providerId: 'google-gemini',
    label: 'Gemini 3.1 Flash Lite Image (Économique)',
    tier: 'economy',
    descriptionFr:
      'Modèle rapide et économique pour explorations rapides de cadrages, variations de tenues et pré-storyboards en 1K.',
    descriptionEn:
      'Fast, economical model for quick framing studies, wardrobe explorations, and 1K storyboard drafts.',
    supportedResolutions: ['1K'],
    supportsReferenceImages: true,
    supportsPixelMask: false,
    pricePerImageUsd: {
      '1K': 0.02,
      '2K': 0.02,
      '4K': 0.02,
    },
    notesFr:
      'Génère en résolution standard 1K. Optimisé pour les explorations à faible coût.',
    notesEn: 'Generates at standard 1K resolution. Optimized for low-cost exploration.',
    updatedAt: '2026-11-01',
  },
];

export const CINEMATIC_REALISM_DIRECTIVE = [
  'Photorealistic live-action 35mm cinema still frame.',
  'Natural human anatomy, authentic skin pores and fine micro-texture, believable expressions, realistic fabric weave and weight.',
  'Professional cinematography lighting, physically accurate depth of field, disciplined film color grading, theatrical production design.',
  'Strictly avoid cartoon, anime, manga, digital painting, CGI plastic look, airbrushed wax skin, or stylized illustration.',
].join(' ');

/**
 * Maps user-selected CineStudio aspect ratios to officially supported Gemini imageConfig.aspectRatio values.
 * Gemini natively supports: "1:1", "3:4", "4:3", "9:16", "16:9".
 * For "4:5", we pass "3:4" (closest vertical portrait ratio) and instruct natural framing without distortion.
 */
export function resolveGeminiAspectRatio(requested: AspectRatio): {
  apiAspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
  framingInstruction: string;
  noteFr: string | null;
  noteEn: string | null;
} {
  if (requested === '4:5') {
    return {
      apiAspectRatio: '3:4',
      framingInstruction:
        'Compose for vertical 4:5 cinema portrait framing with balanced headroom and zero distortion.',
      noteFr:
        'Le format 4:5 est généré via le ratio vertical natif le plus proche pris en charge par Gemini (3:4) avec cadrage adapté sans déformation.',
      noteEn:
        '4:5 is generated using Gemini’s closest supported vertical ratio (3:4) with adapted framing and zero distortion.',
    };
  }
  return {
    apiAspectRatio: requested,
    framingInstruction: `Compose naturally for ${requested} cinema aspect ratio without stretching or cropping distortion.`,
    noteFr: null,
    noteEn: null,
  };
}

export function resolveEffectiveResolution(
  model: ModelPricingEntry,
  requested: ImageResolution
): ImageResolution {
  if (model.supportedResolutions.includes(requested)) {
    return requested;
  }
  return model.supportedResolutions[0] ?? '1K';
}
