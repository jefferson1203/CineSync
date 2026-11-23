import { GoogleGenAI, Type } from '@google/genai';
import type {
  AspectRatio,
  Character,
  CostEstimate,
  ImageModelId,
  ImageResolution,
  Language,
  LocationItem,
  ModelPricingEntry,
  Outfit,
  SceneItem,
  Screenplay,
  ScreenplayAnalysis,
  StoryboardShot,
  StudioSettings,
} from '../../src/shared/types.ts';
import {
  CINEMATIC_REALISM_DIRECTIVE,
  DEFAULT_IMAGE_MODELS,
  GEMINI_TEXT_MODEL,
  resolveEffectiveResolution,
  resolveGeminiAspectRatio,
} from '../config/models.ts';
import { logError, logInfo } from '../services/logger.ts';
import { resolveGeminiCredential } from '../services/secretStore.ts';
import type {
  EditImageRequest,
  GeneratedImageOutput,
  GenerateImagesRequest,
  ImageProvider,
  ProviderAvailabilityResult,
} from './types.ts';

function createGeminiClient(): GoogleGenAI {
  const { apiKey } = resolveGeminiCredential();
  if (!apiKey) {
    throw new Error(
      'Clé API Google Gemini introuvable côté serveur. Configurez GEMINI_API_KEY dans AI Studio (Settings > Secrets) ou via le script macOS Keychain.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return new Error(
      'Clé API Google refusée ou invalide (403/400). Vérifiez votre clé dans Settings > Secrets (ou votre trousseau macOS).'
    );
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return new Error(
      'Quota Google Gemini dépassé (429). Vérifiez que votre clé API est bien associée à un compte facturable.'
    );
  }
  if (raw.includes('NOT_FOUND') || raw.includes('404')) {
    return new Error(
      `Modèle Google Gemini introuvable ou indisponible sur ce compte (404) : ${raw}`
    );
  }
  return new Error(`Erreur Google Gemini : ${raw}`);
}

export class GoogleGeminiProvider implements ImageProvider {
  readonly id = 'google-gemini';
  readonly name = 'Google Gemini';

  listModels(settings: StudioSettings): ModelPricingEntry[] {
    return settings.pricingTable?.length ? settings.pricingTable : DEFAULT_IMAGE_MODELS;
  }

  async checkAvailability(): Promise<ProviderAvailabilityResult> {
    const checkedAt = new Date().toISOString();
    const cred = resolveGeminiCredential();
    if (!cred.apiKey) {
      return {
        available: false,
        message: 'Aucune clé API Google détectée côté serveur (env / Keychain / fichier local).',
        checkedAt,
        verifiedModels: [],
      };
    }

    try {
      const ai = createGeminiClient();
      const response = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: 'Respond with OK.',
      });
      const okText = response.text?.trim() ?? '';
      logInfo('geminiProvider', 'Connection test succeeded', { textModel: GEMINI_TEXT_MODEL });
      return {
        available: true,
        message: `Connexion opérationnelle (${GEMINI_TEXT_MODEL} a répondu : "${okText.slice(0, 24)}").`,
        checkedAt,
        verifiedModels: [GEMINI_TEXT_MODEL, ...DEFAULT_IMAGE_MODELS.map((m) => m.modelId)],
      };
    } catch (err) {
      const formatted = formatGeminiError(err);
      logError('geminiProvider', 'Connection test failed', { error: formatted.message });
      return {
        available: false,
        message: formatted.message,
        checkedAt,
        verifiedModels: [],
      };
    }
  }

  estimateCost(params: {
    modelId: ImageModelId;
    resolution: ImageResolution;
    aspectRatio: AspectRatio;
    variantCount: number;
    settings: StudioSettings;
  }): CostEstimate {
    const models = this.listModels(params.settings);
    const model = models.find((m) => m.modelId === params.modelId) ?? models[0];
    const effectiveResolution = resolveEffectiveResolution(model, params.resolution);
    const count = Math.max(1, Math.min(8, Math.round(params.variantCount || 1)));
    const unitCostUsd = model.pricePerImageUsd[effectiveResolution] ?? model.pricePerImageUsd['1K'] ?? 0.04;
    const totalCostUsd = Number((unitCostUsd * count).toFixed(4));

    const currency = params.settings.currency ?? 'USD';
    const rate = currency === 'EUR' ? params.settings.eurExchangeRate || 0.92 : 1;
    const ratioInfo = resolveGeminiAspectRatio(params.aspectRatio);

    return {
      providerId: this.id,
      modelId: model.modelId,
      modelLabel: model.label,
      resolution: effectiveResolution,
      aspectRatio: params.aspectRatio,
      effectiveApiAspectRatio: ratioInfo.apiAspectRatio,
      aspectRatioNote:
        params.settings.language === 'en' ? ratioInfo.noteEn : ratioInfo.noteFr,
      variantCount: count,
      unitCostUsd,
      totalCostUsd,
      displayCurrency: currency,
      unitCostDisplay: Number((unitCostUsd * rate).toFixed(4)),
      totalCostDisplay: Number((totalCostUsd * rate).toFixed(4)),
      additionalCostsNote:
        params.settings.language === 'en'
          ? 'Reference images add input image tokens. Exact currency billing is managed by Google Cloud Billing and not returned verbatim by the API.'
          : 'Les images de référence ajoutent des tokens d’entrée. La facturation exacte est établie par Google Cloud Billing et n’est pas retournée en devise par l’API.',
      pricingUpdatedAt: model.updatedAt,
      requiresInternet: true,
    };
  }

  async generateImages(
    req: GenerateImagesRequest,
    settings: StudioSettings
  ): Promise<{
    outputs: GeneratedImageOutput[];
    effectivePrompt: string;
    effectiveResolution: ImageResolution;
    effectiveApiAspectRatio: string;
  }> {
    const ai = createGeminiClient();
    const models = this.listModels(settings);
    const model = models.find((m) => m.modelId === req.modelId) ?? models[0];
    const effectiveResolution = resolveEffectiveResolution(model, req.resolution);
    const ratioInfo = resolveGeminiAspectRatio(req.aspectRatio);
    const count = Math.max(1, Math.min(8, Math.round(req.variantCount || 1)));

    const promptSegments = [
      req.prompt.trim(),
      ratioInfo.framingInstruction,
      req.enforceCinematicRealism !== false ? CINEMATIC_REALISM_DIRECTIVE : '',
    ].filter(Boolean);

    if (req.references && req.references.length > 0) {
      promptSegments.push(
        `CRITICAL VISUAL CONTINUITY: Use the attached ${req.references.length} reference image(s) (${req.references
          .map((r) => r.label)
          .join(', ')}) to preserve exact facial structure, physical identity, skin tone, hair, and/or set architecture. Do not alter locked character identity.`
      );
    }

    const effectivePrompt = promptSegments.join('\n\n');

    const imageConfig: Record<string, string> = {
      aspectRatio: ratioInfo.apiAspectRatio,
    };
    if (model.modelId === 'gemini-nano-banana-2.1' || model.modelId === 'gemini-3-pro-image') {
      imageConfig.imageSize = effectiveResolution;
    }

    const runSingleVariant = async (variantIndex: number): Promise<GeneratedImageOutput> => {
      const parts: Array<
        { text: string } | { inlineData: { data: string; mimeType: string } }
      > = [];

      for (const ref of req.references ?? []) {
        parts.push({
          inlineData: {
            data: ref.base64Data,
            mimeType: ref.mimeType,
          },
        });
      }

      const variantSuffix =
        count > 1
          ? `\n\n[Studio take ${variantIndex + 1} of ${count}: preserve exact subject identity and set continuity while offering subtle natural cinematic variation in lighting nuance or micro-expression.]`
          : '';

      parts.push({ text: `${effectivePrompt}${variantSuffix}` });

      try {
        const response = await ai.models.generateContent({
          model: model.modelId,
          contents: { parts },
          config: {
            imageConfig,
          },
        });

        let imageBase64: string | null = null;
        let mimeType = 'image/png';
        const textNotes: string[] = [];

        for (const part of response.candidates?.[0]?.content?.parts ?? []) {
          if (part.inlineData?.data && !imageBase64) {
            imageBase64 = part.inlineData.data;
            mimeType = part.inlineData.mimeType ?? 'image/png';
          } else if (part.text) {
            textNotes.push(part.text);
          }
        }

        if (!imageBase64) {
          throw new Error(
            textNotes.join(' ').trim() ||
              'Le modèle Gemini n’a renvoyé aucune image (vérifiez le prompt ou les filtres de sécurité).'
          );
        }

        const usage = response.usageMetadata
          ? {
              promptTokenCount: response.usageMetadata.promptTokenCount,
              candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
              totalTokenCount: response.usageMetadata.totalTokenCount,
            }
          : null;

        return {
          buffer: Buffer.from(imageBase64, 'base64'),
          mimeType,
          modelNotes: textNotes.length ? textNotes.join('\n') : null,
          usageTokens: usage,
        };
      } catch (err) {
        throw formatGeminiError(err);
      }
    };

    // Run sequentially or in small batches of 2 to respect rate limits cleanly
    const outputs: GeneratedImageOutput[] = [];
    for (let i = 0; i < count; i += 2) {
      const batch = [runSingleVariant(i)];
      if (i + 1 < count) {
        batch.push(runSingleVariant(i + 1));
      }
      const results = await Promise.all(batch);
      outputs.push(...results);
    }

    logInfo('geminiProvider', 'Generated images successfully', {
      modelId: model.modelId,
      resolution: effectiveResolution,
      count: outputs.length,
    });

    return {
      outputs,
      effectivePrompt,
      effectiveResolution,
      effectiveApiAspectRatio: ratioInfo.apiAspectRatio,
    };
  }

  async editImage(
    req: EditImageRequest,
    settings: StudioSettings
  ): Promise<{
    output: GeneratedImageOutput;
    effectivePrompt: string;
    effectiveResolution: ImageResolution;
    usedPixelMask: boolean;
    limitationNotice: string | null;
  }> {
    const ai = createGeminiClient();
    const models = this.listModels(settings);
    const model = models.find((m) => m.modelId === req.modelId) ?? models[0];
    const effectiveResolution = resolveEffectiveResolution(model, req.resolution);
    const ratioInfo = resolveGeminiAspectRatio(req.aspectRatio);

    const regionPrompt = req.region
      ? `TARGET REGION FOCUS: Apply the requested edit specifically inside the rectangular zone located at x=${Math.round(
          req.region.xPct
        )}% to ${Math.round(req.region.xPct + req.region.widthPct)}% horizontally, and y=${Math.round(
          req.region.yPct
        )}% to ${Math.round(
          req.region.yPct + req.region.heightPct
        )}% vertically from the top-left corner. Preserve everything outside this zone as faithfully as possible, especially any locked character facial identity and lighting continuity.`
      : 'Preserve overall composition, framing, and locked character identity while applying the requested conversational adjustment.';

    const effectivePrompt = [
      'Edit the provided source cinema frame according to the director instruction below.',
      regionPrompt,
      `DIRECTOR EDIT INSTRUCTION: ${req.instruction.trim()}`,
      CINEMATIC_REALISM_DIRECTIVE,
    ].join('\n\n');

    const parts: Array<
      { text: string } | { inlineData: { data: string; mimeType: string } }
    > = [
      {
        inlineData: {
          data: req.sourceImageBase64,
          mimeType: req.sourceMimeType,
        },
      },
    ];

    for (const ref of req.references ?? []) {
      parts.push({
        inlineData: {
          data: ref.base64Data,
          mimeType: ref.mimeType,
        },
      });
    }

    parts.push({ text: effectivePrompt });

    const imageConfig: Record<string, string> = {
      aspectRatio: ratioInfo.apiAspectRatio,
    };
    if (model.modelId === 'gemini-nano-banana-2.1' || model.modelId === 'gemini-3-pro-image') {
      imageConfig.imageSize = effectiveResolution;
    }

    try {
      const response = await ai.models.generateContent({
        model: model.modelId,
        contents: { parts },
        config: { imageConfig },
      });

      let imageBase64: string | null = null;
      let mimeType = 'image/png';
      const textNotes: string[] = [];

      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data && !imageBase64) {
          imageBase64 = part.inlineData.data;
          mimeType = part.inlineData.mimeType ?? 'image/png';
        } else if (part.text) {
          textNotes.push(part.text);
        }
      }

      if (!imageBase64) {
        throw new Error(
          textNotes.join(' ').trim() || 'Aucune image modifiée n’a été renvoyée par Gemini.'
        );
      }

      const usage = response.usageMetadata
        ? {
            promptTokenCount: response.usageMetadata.promptTokenCount,
            candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
            totalTokenCount: response.usageMetadata.totalTokenCount,
          }
        : null;

      return {
        output: {
          buffer: Buffer.from(imageBase64, 'base64'),
          mimeType,
          modelNotes: textNotes.length ? textNotes.join('\n') : null,
          usageTokens: usage,
        },
        effectivePrompt,
        effectiveResolution,
        usedPixelMask: false,
        limitationNotice: req.region
          ? settings.language === 'en'
            ? 'Gemini performs image-to-image guided regional retouching rather than strict binary pixel-mask inpainting; subtle variations outside the selection can occur. The original version is preserved intact.'
            : 'Le modèle Gemini effectue une retouche guidée à partir de l’image originale et des coordonnées de zone plutôt qu’un inpainting par masque binaire strict ; de légères variations hors zone peuvent survenir. La version originale est conservée intacte.'
          : null,
      };
    } catch (err) {
      throw formatGeminiError(err);
    }
  }
}

export const geminiImageProvider = new GoogleGeminiProvider();

/**
 * Gemini 4 Hydrogen — Film Pre-Production Intelligence Services
 */
export async function enrichCharacterWithGemini(
  freeDescription: string,
  language: Language
): Promise<Partial<Character>> {
  const ai = createGeminiClient();
  const langLabel = language === 'en' ? 'English' : 'French';

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: `Transform this brief character idea into a complete, realistic, casting-ready film character profile in ${langLabel}. Keep every physical detail concrete, photogenic, and grounded in live-action cinema realism.\n\nInput description:\n${freeDescription}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            role: { type: Type.STRING },
            apparentAge: { type: Type.STRING },
            gender: { type: Type.STRING },
            originAndTraits: { type: Type.STRING },
            height: { type: Type.STRING },
            build: { type: Type.STRING },
            skinTone: { type: Type.STRING },
            faceShape: { type: Type.STRING },
            eyes: { type: Type.STRING },
            hair: { type: Type.STRING },
            hairstyle: { type: Type.STRING },
            facialHair: { type: Type.STRING },
            physicalMarks: { type: Type.STRING },
            personality: { type: Type.STRING },
            expressions: { type: Type.STRING },
            visualParticularities: { type: Type.STRING },
          },
          required: ['name', 'role', 'apparentAge', 'gender', 'faceShape', 'eyes', 'hair'],
        },
      },
    });

    return JSON.parse(response.text || '{}') as Partial<Character>;
  } catch (err) {
    throw formatGeminiError(err);
  }
}

export async function analyzeScreenplayWithGemini(
  scriptText: string,
  language: Language
): Promise<ScreenplayAnalysis> {
  const ai = createGeminiClient();
  const langLabel = language === 'en' ? 'English' : 'French';

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: `You are a veteran first assistant director and script supervisor. Analyze the following screenplay carefully WITHOUT altering the original text. Output your structured breakdown in ${langLabel} (even if the script is written in another language). Extract all characters, locations, key moments, temporal cues, and a concrete scene-by-scene production breakdown.\n\nSCREENPLAY:\n${scriptText.slice(0, 60000)}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            detectedCharacters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  role: { type: Type.STRING },
                  description: { type: Type.STRING },
                },
                required: ['name', 'role', 'description'],
              },
            },
            detectedLocations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  type: { type: Type.STRING },
                  ambiance: { type: Type.STRING },
                  lighting: { type: Type.STRING },
                  description: { type: Type.STRING },
                },
                required: ['name', 'type', 'ambiance', 'lighting', 'description'],
              },
            },
            proposedScenes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  locationName: { type: Type.STRING },
                  timeOfDay: { type: Type.STRING },
                  characters: { type: Type.ARRAY, items: { type: Type.STRING } },
                  actions: { type: Type.STRING },
                  dialogues: { type: Type.STRING },
                  emotions: { type: Type.STRING },
                  ambiance: { type: Type.STRING },
                  lighting: { type: Type.STRING },
                  framing: { type: Type.STRING },
                  visualGoal: { type: Type.STRING },
                },
                required: ['title', 'locationName', 'timeOfDay', 'actions', 'visualGoal'],
              },
            },
            keyMoments: { type: Type.ARRAY, items: { type: Type.STRING } },
            temporalCues: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['summary', 'detectedCharacters', 'detectedLocations', 'proposedScenes'],
        },
      },
    });

    return JSON.parse(response.text || '{}') as ScreenplayAnalysis;
  } catch (err) {
    throw formatGeminiError(err);
  }
}

export async function proposeSceneWithGemini(
  description: string,
  context: { characters: Character[]; locations: LocationItem[]; language: Language }
): Promise<Partial<SceneItem>> {
  const ai = createGeminiClient();
  const langLabel = context.language === 'en' ? 'English' : 'French';

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: `Propose a structured film production scene sheet in ${langLabel} from the director's free description. Reuse existing project characters/locations when relevant.\n\nExisting characters: ${context.characters
        .map((c) => c.name)
        .join(', ') || 'None'}\nExisting locations: ${context.locations
        .map((l) => l.name)
        .join(', ') || 'None'}\n\nScene description:\n${description}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            locationName: { type: Type.STRING },
            timeOfDay: { type: Type.STRING },
            actions: { type: Type.STRING },
            dialogues: { type: Type.STRING },
            emotions: { type: Type.STRING },
            ambiance: { type: Type.STRING },
            lighting: { type: Type.STRING },
            framing: { type: Type.STRING },
            visualGoal: { type: Type.STRING },
          },
          required: ['title', 'description', 'locationName', 'timeOfDay', 'actions', 'lighting'],
        },
      },
    });

    return JSON.parse(response.text || '{}') as Partial<SceneItem>;
  } catch (err) {
    throw formatGeminiError(err);
  }
}

export async function proposeStoryboardShotsWithGemini(params: {
  scene: SceneItem;
  characters: Character[];
  outfits: Outfit[];
  location: LocationItem | null;
  desiredShotCount?: number;
  language: Language;
}): Promise<Array<Partial<StoryboardShot>>> {
  const ai = createGeminiClient();
  const langLabel = params.language === 'en' ? 'English' : 'French';

  const charDetails = params.characters
    .map((c) => {
      const assignedOutfitId = params.scene.outfitAssignments[c.id];
      const outfit = params.outfits.find((o) => o.id === assignedOutfitId);
      return `- ${c.name} (${c.apparentAge}, ${c.faceShape}, ${c.hair}, ${c.eyes}${
        outfit ? `; wearing: ${outfit.name} — ${outfit.description}` : ''
      })`;
    })
    .join('\n');

  const countInstruction = params.desiredShotCount
    ? `Propose exactly ${params.desiredShotCount} shots.`
    : 'Choose the ideal cinematic number of shots (typically between 4 and 8) to cover the dramatic beats of the scene.';

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: `You are a cinematographer and storyboard artist. Create a shot-by-shot visual breakdown for the scene below. Write descriptive fields in ${langLabel}, and write each shot's "prompt" as a detailed photorealistic 35mm cinema still prompt ready for Gemini image generation.\n\n${countInstruction}\n\nAllowed framing values (use exact enum string): extreme_close_up, close_up, medium_close_up, cowboy_shot, medium_shot, wide_shot, establishing_shot, pov.\n\nSCENE: ${params.scene.title}\nLocation: ${params.location?.name ?? params.scene.locationName} (${params.location?.architecture ?? ''} / ${params.location?.lighting ?? params.scene.lighting})\nTime of day: ${params.scene.timeOfDay}\nAmbiance: ${params.scene.ambiance}\nEmotions: ${params.scene.emotions}\nActions: ${params.scene.actions}\nDialogues: ${params.scene.dialogues}\nVisual goal: ${params.scene.visualGoal}\n\nCHARACTERS PRESENT:\n${charDetails || 'None specified'}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              shotNumber: { type: Type.INTEGER },
              actionDescription: { type: Type.STRING },
              expression: { type: Type.STRING },
              pose: { type: Type.STRING },
              outfitNotes: { type: Type.STRING },
              framing: { type: Type.STRING },
              cameraAngle: { type: Type.STRING },
              composition: { type: Type.STRING },
              lighting: { type: Type.STRING },
              ambiance: { type: Type.STRING },
              durationSec: { type: Type.NUMBER },
              prompt: { type: Type.STRING },
            },
            required: ['shotNumber', 'actionDescription', 'framing', 'cameraAngle', 'lighting', 'prompt'],
          },
        },
      },
    });

    return JSON.parse(response.text || '[]') as Array<Partial<StoryboardShot>>;
  } catch (err) {
    throw formatGeminiError(err);
  }
}

export async function runCentralAssistantWithGemini(params: {
  userMessage: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  projectContext: {
    projectTitle: string;
    logline: string;
    visualTone: string;
    characters: Character[];
    outfits: Outfit[];
    locations: LocationItem[];
    screenplays: Screenplay[];
    scenes: SceneItem[];
    shotsCount: number;
  };
  language: Language;
}): Promise<{
  reply: string;
  proposal: {
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
  } | null;
}> {
  const ai = createGeminiClient();
  const langLabel = params.language === 'en' ? 'English' : 'French';

  const contextSummary = JSON.stringify(
    {
      project: {
        title: params.projectContext.projectTitle,
        logline: params.projectContext.logline,
        visualTone: params.projectContext.visualTone,
      },
      characters: params.projectContext.characters.map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
        apparentAge: c.apparentAge,
        identityLocked: c.identityLocked,
      })),
      outfits: params.projectContext.outfits.map((o) => ({
        id: o.id,
        characterId: o.characterId,
        name: o.name,
        category: o.category,
      })),
      locations: params.projectContext.locations.map((l) => ({
        id: l.id,
        name: l.name,
        type: l.locationType,
        ambiance: l.ambiance,
      })),
      screenplays: params.projectContext.screenplays.map((sp) => ({
        id: sp.id,
        title: sp.title,
        excerpt: sp.workingText.slice(0, 1500),
        analyzed: Boolean(sp.analysis),
      })),
      scenes: params.projectContext.scenes.map((sc) => ({
        id: sc.id,
        title: sc.title,
        locationName: sc.locationName,
        timeOfDay: sc.timeOfDay,
      })),
      totalStoryboardShots: params.projectContext.shotsCount,
    },
    null,
    2
  );

  const recentHistory = params.history
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'Director' : 'Assistant'}: ${m.content}`)
    .join('\n');

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: `Active project data:\n${contextSummary}\n\nRecent conversation:\n${recentHistory}\n\nDirector request:\n${params.userMessage}`,
      config: {
        systemInstruction: `You are the Central Pre-Production Assistant inside CineStudio AI. Reply in ${langLabel}.
RULES:
1. Always use existing project data above; never ask the director to repeat characters, locations, or scenes already saved.
2. Operate strictly in SEMI-AUTOMATIC mode: analyze, explain your recommendation clearly, and if the user wants to create or generate a structured project entity (character, location, scene, outfit, storyboard breakdown), attach a structured proposal in "proposal" and WAIT for explicit validation before execution.
3. For payloadJson, output a valid JSON string matching the actionType:
   - "create_character": {"name","role","apparentAge","gender","originAndTraits","height","build","skinTone","faceShape","eyes","hair","hairstyle","facialHair","physicalMarks","personality","expressions","visualParticularities"}
   - "create_location": {"name","description","locationType","settingRealOrFictional","ambiance","lighting","architecture","colorPalette"}
   - "create_scene": {"title","description","locationName","timeOfDay","actions","dialogues","emotions","ambiance","lighting","framing","visualGoal"}
   - "create_outfit": {"characterId","name","category","description","fabricsAndColors","accessories"}
   - "propose_storyboard": {"sceneId","desiredShotCount"}
   - "none": "{}" when only answering a question or giving advice.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING },
            actionType: { type: Type.STRING },
            proposalSummary: { type: Type.STRING },
            payloadJson: { type: Type.STRING },
          },
          required: ['reply', 'actionType', 'proposalSummary', 'payloadJson'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}') as {
      reply?: string;
      actionType?: string;
      proposalSummary?: string;
      payloadJson?: string;
    };

    const validActions = new Set([
      'create_character',
      'create_location',
      'create_scene',
      'create_outfit',
      'propose_storyboard',
      'prepare_prompts',
    ]);

    let payload: Record<string, unknown> = {};
    if (parsed.payloadJson) {
      try {
        payload = JSON.parse(parsed.payloadJson) as Record<string, unknown>;
      } catch {
        payload = {};
      }
    }

    const actionType =
      parsed.actionType && validActions.has(parsed.actionType)
        ? (parsed.actionType as
            | 'create_character'
            | 'create_location'
            | 'create_scene'
            | 'create_outfit'
            | 'propose_storyboard'
            | 'prepare_prompts')
        : 'none';

    return {
      reply: parsed.reply || 'Analyse terminée.',
      proposal:
        actionType !== 'none'
          ? {
              actionType,
              summary: parsed.proposalSummary || actionType,
              payload,
            }
          : null,
    };
  } catch (err) {
    throw formatGeminiError(err);
  }
}
