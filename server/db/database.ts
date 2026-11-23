import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  ActivityLogEntry,
  AssistantMessage,
  Character,
  CostLogEntry,
  GeneratedImage,
  ImageVersion,
  LocationItem,
  Outfit,
  Project,
  PromptTemplate,
  SceneItem,
  Screenplay,
  StoryboardShot,
  StudioSettings,
} from '../../src/shared/types.ts';
import { DEFAULT_IMAGE_MODELS } from '../config/models.ts';
import {
  DEFAULT_PROJECTS_ROOT,
  ensureProjectDirectoryStructure,
  resolveConfinedPath,
  writeJsonAtomic,
} from '../services/storage.ts';

const DB_PATH = path.resolve(process.cwd(), 'cinestudio.sqlite');

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = initDatabase(DB_PATH);
  }
  return dbInstance;
}

export function initDatabase(customPath?: string): Database.Database {
  const targetPath = customPath ?? DB_PATH;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const db = new Database(targetPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      logline TEXT NOT NULL DEFAULT '',
      genre TEXT NOT NULL DEFAULT '',
      director TEXT NOT NULL DEFAULT '',
      aspect_ratio TEXT NOT NULL DEFAULT '16:9',
      visual_tone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'prep',
      folder_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT '',
      apparent_age TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT '',
      origin_and_traits TEXT NOT NULL DEFAULT '',
      height TEXT NOT NULL DEFAULT '',
      build TEXT NOT NULL DEFAULT '',
      skin_tone TEXT NOT NULL DEFAULT '',
      face_shape TEXT NOT NULL DEFAULT '',
      eyes TEXT NOT NULL DEFAULT '',
      hair TEXT NOT NULL DEFAULT '',
      hairstyle TEXT NOT NULL DEFAULT '',
      facial_hair TEXT NOT NULL DEFAULT '',
      physical_marks TEXT NOT NULL DEFAULT '',
      personality TEXT NOT NULL DEFAULT '',
      expressions TEXT NOT NULL DEFAULT '',
      visual_particularities TEXT NOT NULL DEFAULT '',
      free_description TEXT NOT NULL DEFAULT '',
      identity_locked INTEGER NOT NULL DEFAULT 0,
      official_reference_ids_json TEXT NOT NULL DEFAULT '[]',
      primary_image_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS outfits (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'daily',
      description TEXT NOT NULL DEFAULT '',
      fabrics_and_colors TEXT NOT NULL DEFAULT '',
      accessories TEXT NOT NULL DEFAULT '',
      scene_notes TEXT NOT NULL DEFAULT '',
      reference_image_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      location_type TEXT NOT NULL DEFAULT 'interior_set',
      setting_real_or_fictional TEXT NOT NULL DEFAULT '',
      ambiance TEXT NOT NULL DEFAULT '',
      lighting TEXT NOT NULL DEFAULT '',
      architecture TEXT NOT NULL DEFAULT '',
      color_palette TEXT NOT NULL DEFAULT '',
      reference_image_ids_json TEXT NOT NULL DEFAULT '[]',
      primary_image_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS screenplays (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      source_filename TEXT,
      source_format TEXT NOT NULL DEFAULT 'pasted',
      original_text TEXT NOT NULL,
      working_text TEXT NOT NULL,
      analysis_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      screenplay_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      location_id TEXT,
      location_name TEXT NOT NULL DEFAULT '',
      time_of_day TEXT NOT NULL DEFAULT 'Jour',
      character_ids_json TEXT NOT NULL DEFAULT '[]',
      outfit_assignments_json TEXT NOT NULL DEFAULT '{}',
      actions TEXT NOT NULL DEFAULT '',
      dialogues TEXT NOT NULL DEFAULT '',
      emotions TEXT NOT NULL DEFAULT '',
      ambiance TEXT NOT NULL DEFAULT '',
      lighting TEXT NOT NULL DEFAULT '',
      framing TEXT NOT NULL DEFAULT '',
      visual_goal TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS storyboard_shots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      scene_id TEXT NOT NULL,
      shot_number INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 1,
      action_description TEXT NOT NULL DEFAULT '',
      visible_character_ids_json TEXT NOT NULL DEFAULT '[]',
      expression TEXT NOT NULL DEFAULT '',
      pose TEXT NOT NULL DEFAULT '',
      outfit_notes TEXT NOT NULL DEFAULT '',
      location_id TEXT,
      framing TEXT NOT NULL DEFAULT 'medium_shot',
      camera_angle TEXT NOT NULL DEFAULT 'Niveau des yeux',
      composition TEXT NOT NULL DEFAULT '',
      lighting TEXT NOT NULL DEFAULT '',
      ambiance TEXT NOT NULL DEFAULT '',
      duration_sec REAL NOT NULL DEFAULT 4,
      prompt TEXT NOT NULL DEFAULT '',
      official_image_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      title TEXT NOT NULL,
      official_version_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS image_versions (
      id TEXT PRIMARY KEY,
      image_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      parent_version_id TEXT,
      file_path TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'image/png',
      prompt TEXT NOT NULL,
      model_id TEXT NOT NULL,
      aspect_ratio TEXT NOT NULL,
      resolution TEXT NOT NULL,
      params_json TEXT NOT NULL DEFAULT '{}',
      reference_image_ids_json TEXT NOT NULL DEFAULT '[]',
      edit_instruction TEXT,
      mask_used INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      usage_tokens_json TEXT,
      is_restored_from TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      prompt_body TEXT NOT NULL,
      default_framing TEXT NOT NULL DEFAULT '',
      default_lighting TEXT NOT NULL DEFAULT '',
      is_built_in INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cost_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      operation TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      resolution TEXT NOT NULL,
      aspect_ratio TEXT NOT NULL,
      image_count INTEGER NOT NULL DEFAULT 1,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      actual_cost_known INTEGER NOT NULL DEFAULT 0,
      actual_cost_usd REAL,
      usage_tokens_json TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assistant_messages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      proposal_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  seedDefaultTemplates(db);
  return db;
}

function seedDefaultTemplates(db: Database.Database): void {
  const existing = db.prepare('SELECT COUNT(*) as count FROM prompt_templates').get() as { count: number };
  if (existing.count > 0) return;

  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO prompt_templates (id, name, category, prompt_body, default_framing, default_lighting, is_built_in, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `);

  const defaults: Array<[string, string, string, string, string]> = [
    [
      'Casting — Portrait visage neutre 85mm',
      'character',
      'Close-up theatrical casting portrait on neutral matte mid-gray studio backdrop, 85mm cinema prime lens f/2.0, natural unretouched skin texture, authentic eye catchlight, subtle neutral expression, zero stylization.',
      'Gros plan (85mm)',
      'Soft diffused Fresnel key light, subtle rim separation',
    ],
    [
      'Casting — Planche de référence 3 vues (Face / Profil / Dos)',
      'character',
      'Professional film character reference sheet showing three full-body standing views side by side on a seamless neutral light gray studio backdrop: straight front view, 90-degree side profile view, and rear back view. Identical individual across all three views, relaxed neutral posture, even shadowless studio lighting.',
      'Plan en pied (3 vues)',
      'Even neutral softbox studio illumination',
    ],
    [
      'Costume — Fiche tenue sur mannequin vivant',
      'outfit',
      'Full-length wardrobe fitting still photograph on neutral studio backdrop, crisp fabric weave detail, realistic garment drape and stitching, natural folds, accurate color rendition for continuity department.',
      'Plan américain / en pied',
      'Balanced 5600K studio daylight',
    ],
    [
      'Décor — Repérage grand angle 24mm',
      'location',
      'Architectural cinema location scout photograph, 24mm wide-angle cinema lens, deep depth of field showing spatial layout, authentic weathered materials, practical light sources, atmospheric depth, zero people in frame.',
      "Plan d'ensemble (24mm)",
      'Natural motivated directional light',
    ],
    [
      'Storyboard — Plan cinéma anamorphique 35mm',
      'storyboard',
      'Live-action anamorphic 35mm cinema still frame, authentic camera blocking, motivated tungsten and ambient practical lighting, subtle film grain, restrained cinematic color grading, emotionally grounded performance.',
      'Plan moyen (35mm anamorphique)',
      'Chiaroscuro motivated film lighting',
    ],
  ];

  for (const [name, category, body, framing, lighting] of defaults) {
    insert.run(crypto.randomUUID(), name, category, body, framing, lighting, now);
  }
}

export function getSettings(db: Database.Database = getDb()): StudioSettings {
  const row = db.prepare('SELECT value_json FROM settings WHERE key = ?').get('studio_settings') as
    | { value_json: string }
    | undefined;

  const fallback: StudioSettings = {
    language: 'fr',
    projectsRoot: DEFAULT_PROJECTS_ROOT,
    defaultModel: 'gemini-nano-banana-2.1',
    defaultAspectRatio: '16:9',
    defaultResolution: '1K',
    currency: 'USD',
    eurExchangeRate: 0.92,
    activeProjectId: null,
    pricingTable: DEFAULT_IMAGE_MODELS,
  };

  if (!row) {
    saveSettings(fallback, db);
    return fallback;
  }

  try {
    const parsed = JSON.parse(row.value_json) as Partial<StudioSettings>;
    return {
      ...fallback,
      ...parsed,
      pricingTable:
        Array.isArray(parsed.pricingTable) && parsed.pricingTable.length > 0
          ? parsed.pricingTable
          : DEFAULT_IMAGE_MODELS,
    };
  } catch {
    return fallback;
  }
}

export function saveSettings(settings: StudioSettings, db: Database.Database = getDb()): StudioSettings {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
  ).run('studio_settings', JSON.stringify(settings), now);
  return settings;
}

export function logActivity(
  projectId: string | null,
  module: string,
  action: string,
  details: string,
  db: Database.Database = getDb()
): ActivityLogEntry {
  const entry: ActivityLogEntry = {
    id: crypto.randomUUID(),
    projectId,
    module,
    action,
    details,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    'INSERT INTO activity_logs (id, project_id, module, action, details, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(entry.id, entry.projectId, entry.module, entry.action, entry.details, entry.createdAt);
  return entry;
}

export function mapProjectRow(row: Record<string, unknown>, db: Database.Database = getDb()): Project {
  const id = String(row.id);
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE project_id = ?`).get(id) as { c: number }).c;

  return {
    id,
    slug: String(row.slug),
    title: String(row.title),
    logline: String(row.logline ?? ''),
    genre: String(row.genre ?? ''),
    director: String(row.director ?? ''),
    aspectRatio: (row.aspect_ratio as Project['aspectRatio']) ?? '16:9',
    visualTone: String(row.visual_tone ?? ''),
    status: (row.status as Project['status']) ?? 'prep',
    folderPath: String(row.folder_path),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    counts: {
      characters: count('characters'),
      outfits: count('outfits'),
      locations: count('locations'),
      screenplays: count('screenplays'),
      scenes: count('scenes'),
      shots: count('storyboard_shots'),
      images: count('images'),
    },
  };
}

export function mapCharacterRow(row: Record<string, unknown>): Character {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    slug: String(row.slug),
    name: String(row.name),
    role: String(row.role ?? ''),
    apparentAge: String(row.apparent_age ?? ''),
    gender: String(row.gender ?? ''),
    originAndTraits: String(row.origin_and_traits ?? ''),
    height: String(row.height ?? ''),
    build: String(row.build ?? ''),
    skinTone: String(row.skin_tone ?? ''),
    faceShape: String(row.face_shape ?? ''),
    eyes: String(row.eyes ?? ''),
    hair: String(row.hair ?? ''),
    hairstyle: String(row.hairstyle ?? ''),
    facialHair: String(row.facial_hair ?? ''),
    physicalMarks: String(row.physical_marks ?? ''),
    personality: String(row.personality ?? ''),
    expressions: String(row.expressions ?? ''),
    visualParticularities: String(row.visual_particularities ?? ''),
    freeDescription: String(row.free_description ?? ''),
    identityLocked: Boolean(row.identity_locked),
    officialReferenceIds: safeJsonParse<string[]>(row.official_reference_ids_json, []),
    primaryImageId: row.primary_image_id ? String(row.primary_image_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapOutfitRow(row: Record<string, unknown>): Outfit {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    characterId: String(row.character_id),
    name: String(row.name),
    category: (row.category as Outfit['category']) ?? 'daily',
    description: String(row.description ?? ''),
    fabricsAndColors: String(row.fabrics_and_colors ?? ''),
    accessories: String(row.accessories ?? ''),
    sceneNotes: String(row.scene_notes ?? ''),
    referenceImageId: row.reference_image_id ? String(row.reference_image_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapLocationRow(row: Record<string, unknown>): LocationItem {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    slug: String(row.slug),
    name: String(row.name),
    description: String(row.description ?? ''),
    locationType: (row.location_type as LocationItem['locationType']) ?? 'interior_set',
    settingRealOrFictional: String(row.setting_real_or_fictional ?? ''),
    ambiance: String(row.ambiance ?? ''),
    lighting: String(row.lighting ?? ''),
    architecture: String(row.architecture ?? ''),
    colorPalette: String(row.color_palette ?? ''),
    referenceImageIds: safeJsonParse<string[]>(row.reference_image_ids_json, []),
    primaryImageId: row.primary_image_id ? String(row.primary_image_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapScreenplayRow(row: Record<string, unknown>): Screenplay {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    title: String(row.title),
    sourceFilename: row.source_filename ? String(row.source_filename) : null,
    sourceFormat: (row.source_format as Screenplay['sourceFormat']) ?? 'pasted',
    originalText: String(row.original_text ?? ''),
    workingText: String(row.working_text ?? ''),
    analysis: row.analysis_json ? safeJsonParse(row.analysis_json, null) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapSceneRow(row: Record<string, unknown>): SceneItem {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    screenplayId: row.screenplay_id ? String(row.screenplay_id) : null,
    sortOrder: Number(row.sort_order ?? 1),
    title: String(row.title),
    description: String(row.description ?? ''),
    locationId: row.location_id ? String(row.location_id) : null,
    locationName: String(row.location_name ?? ''),
    timeOfDay: String(row.time_of_day ?? 'Jour'),
    characterIds: safeJsonParse<string[]>(row.character_ids_json, []),
    outfitAssignments: safeJsonParse<Record<string, string>>(row.outfit_assignments_json, {}),
    actions: String(row.actions ?? ''),
    dialogues: String(row.dialogues ?? ''),
    emotions: String(row.emotions ?? ''),
    ambiance: String(row.ambiance ?? ''),
    lighting: String(row.lighting ?? ''),
    framing: String(row.framing ?? ''),
    visualGoal: String(row.visual_goal ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapShotRow(row: Record<string, unknown>): StoryboardShot {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    sceneId: String(row.scene_id),
    shotNumber: Number(row.shot_number ?? 1),
    sortOrder: Number(row.sort_order ?? 1),
    actionDescription: String(row.action_description ?? ''),
    visibleCharacterIds: safeJsonParse<string[]>(row.visible_character_ids_json, []),
    expression: String(row.expression ?? ''),
    pose: String(row.pose ?? ''),
    outfitNotes: String(row.outfit_notes ?? ''),
    locationId: row.location_id ? String(row.location_id) : null,
    framing: (row.framing as StoryboardShot['framing']) ?? 'medium_shot',
    cameraAngle: String(row.camera_angle ?? 'Niveau des yeux'),
    composition: String(row.composition ?? ''),
    lighting: String(row.lighting ?? ''),
    ambiance: String(row.ambiance ?? ''),
    durationSec: Number(row.duration_sec ?? 4),
    prompt: String(row.prompt ?? ''),
    officialImageId: row.official_image_id ? String(row.official_image_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapImageVersionRow(row: Record<string, unknown>, projectId: string): ImageVersion {
  const filePath = String(row.file_path);
  return {
    id: String(row.id),
    imageId: String(row.image_id),
    versionNumber: Number(row.version_number),
    parentVersionId: row.parent_version_id ? String(row.parent_version_id) : null,
    filePath,
    url: `/api/media/${encodeURIComponent(projectId)}/${filePath
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`,
    mimeType: String(row.mime_type ?? 'image/png'),
    prompt: String(row.prompt),
    modelId: row.model_id as ImageVersion['modelId'],
    aspectRatio: row.aspect_ratio as ImageVersion['aspectRatio'],
    resolution: row.resolution as ImageVersion['resolution'],
    paramsJson: safeJsonParse<Record<string, unknown>>(row.params_json, {}),
    referenceImageIds: safeJsonParse<string[]>(row.reference_image_ids_json, []),
    editInstruction: row.edit_instruction ? String(row.edit_instruction) : null,
    maskUsed: Boolean(row.mask_used),
    estimatedCostUsd: Number(row.estimated_cost_usd ?? 0),
    usageTokens: row.usage_tokens_json ? safeJsonParse(row.usage_tokens_json, null) : null,
    isRestoredFrom: row.is_restored_from ? String(row.is_restored_from) : null,
    createdAt: String(row.created_at),
  };
}

export function hydrateImage(
  row: Record<string, unknown>,
  db: Database.Database = getDb()
): GeneratedImage {
  const id = String(row.id);
  const projectId = String(row.project_id);
  const versionRows = db
    .prepare('SELECT * FROM image_versions WHERE image_id = ? ORDER BY version_number DESC')
    .all(id) as Record<string, unknown>[];
  const versions = versionRows.map((v) => mapImageVersionRow(v, projectId));
  const officialVersionId = row.official_version_id ? String(row.official_version_id) : versions[0]?.id ?? null;
  const officialVersion = versions.find((v) => v.id === officialVersionId) ?? versions[0] ?? null;

  return {
    id,
    projectId,
    entityType: row.entity_type as GeneratedImage['entityType'],
    entityId: row.entity_id ? String(row.entity_id) : null,
    title: String(row.title),
    officialVersionId,
    officialVersion,
    versions,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapPromptTemplateRow(row: Record<string, unknown>): PromptTemplate {
  return {
    id: String(row.id),
    name: String(row.name),
    category: row.category as PromptTemplate['category'],
    promptBody: String(row.prompt_body),
    defaultFraming: String(row.default_framing ?? ''),
    defaultLighting: String(row.default_lighting ?? ''),
    isBuiltIn: Boolean(row.is_built_in),
    createdAt: String(row.created_at),
  };
}

export function mapCostLogRow(row: Record<string, unknown>): CostLogEntry {
  return {
    id: String(row.id),
    projectId: row.project_id ? String(row.project_id) : null,
    projectTitle: row.project_title ? String(row.project_title) : undefined,
    operation: (row.operation as CostLogEntry['operation']) ?? 'generate',
    providerId: String(row.provider_id),
    modelId: row.model_id as CostLogEntry['modelId'],
    resolution: row.resolution as CostLogEntry['resolution'],
    aspectRatio: row.aspect_ratio as CostLogEntry['aspectRatio'],
    imageCount: Number(row.image_count ?? 1),
    estimatedCostUsd: Number(row.estimated_cost_usd ?? 0),
    currency: String(row.currency ?? 'USD'),
    actualCostKnown: Boolean(row.actual_cost_known),
    actualCostUsd: row.actual_cost_usd !== null && row.actual_cost_usd !== undefined ? Number(row.actual_cost_usd) : null,
    usageTokens: row.usage_tokens_json ? safeJsonParse(row.usage_tokens_json, null) : null,
    notes: row.notes ? String(row.notes) : null,
    createdAt: String(row.created_at),
  };
}

export function mapAssistantMessageRow(row: Record<string, unknown>): AssistantMessage {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    role: row.role as AssistantMessage['role'],
    content: String(row.content),
    proposal: row.proposal_json ? safeJsonParse(row.proposal_json, null) : null,
    createdAt: String(row.created_at),
  };
}

/**
 * Syncs an atomic crash-recovery snapshot of the project to <projectFolder>/project.json
 * and saves a backup in <projectFolder>/history/snapshot_latest.json.
 * Strictly excludes any API key or credentials.
 */
export function syncProjectDiskSnapshot(projectId: string, db: Database.Database = getDb()): void {
  const projRow = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as
    | Record<string, unknown>
    | undefined;
  if (!projRow) return;

  const settings = getSettings(db);
  const project = mapProjectRow(projRow, db);
  const projectDir = fs.existsSync(project.folderPath)
    ? project.folderPath
    : ensureProjectDirectoryStructure(settings.projectsRoot, project.slug);

  const characters = (
    db.prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY created_at ASC').all(projectId) as Record<
      string,
      unknown
    >[]
  ).map(mapCharacterRow);
  const outfits = (
    db.prepare('SELECT * FROM outfits WHERE project_id = ? ORDER BY created_at ASC').all(projectId) as Record<
      string,
      unknown
    >[]
  ).map(mapOutfitRow);
  const locations = (
    db.prepare('SELECT * FROM locations WHERE project_id = ? ORDER BY created_at ASC').all(projectId) as Record<
      string,
      unknown
    >[]
  ).map(mapLocationRow);
  const screenplays = (
    db.prepare('SELECT * FROM screenplays WHERE project_id = ? ORDER BY created_at ASC').all(projectId) as Record<
      string,
      unknown
    >[]
  ).map(mapScreenplayRow);
  const scenes = (
    db.prepare('SELECT * FROM scenes WHERE project_id = ? ORDER BY sort_order ASC').all(projectId) as Record<
      string,
      unknown
    >[]
  ).map(mapSceneRow);
  const shots = (
    db.prepare('SELECT * FROM storyboard_shots WHERE project_id = ? ORDER BY scene_id, sort_order ASC').all(projectId) as Record<
      string,
      unknown
    >[]
  ).map(mapShotRow);
  const images = (
    db.prepare('SELECT * FROM images WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as Record<
      string,
      unknown
    >[]
  ).map((r) => hydrateImage(r, db));

  const snapshot = {
    schemaVersion: '1.0',
    exportedAt: new Date().toISOString(),
    project,
    characters,
    outfits,
    locations,
    screenplays,
    scenes,
    shots,
    images,
  };

  writeJsonAtomic(resolveConfinedPath(projectDir, 'project.json'), snapshot);
  writeJsonAtomic(resolveConfinedPath(projectDir, 'history', 'snapshot_latest.json'), snapshot);
}

function safeJsonParse<T>(input: unknown, fallback: T): T {
  if (typeof input !== 'string' || !input) return fallback;
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}
