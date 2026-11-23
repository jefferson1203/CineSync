import crypto from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import JSZip from 'jszip';
import multer from 'multer';
import path from 'path';
import type {
  AspectRatio,
  CameraFraming,
  ImageEntityType,
  ImageModelId,
  ImageResolution,
  LocationType,
  ProviderStatus,
  StudioSettings,
} from '../../src/shared/types.ts';
import { GEMINI_TEXT_MODEL } from '../config/models.ts';
import {
  getDb,
  getSettings,
  hydrateImage,
  logActivity,
  mapAssistantMessageRow,
  mapCharacterRow,
  mapCostLogRow,
  mapLocationRow,
  mapOutfitRow,
  mapProjectRow,
  mapPromptTemplateRow,
  mapSceneRow,
  mapScreenplayRow,
  mapShotRow,
  saveSettings,
  syncProjectDiskSnapshot,
} from '../db/database.ts';
import {
  analyzeScreenplayWithGemini,
  enrichCharacterWithGemini,
  geminiImageProvider,
  proposeSceneWithGemini,
  proposeStoryboardShotsWithGemini,
  runCentralAssistantWithGemini,
} from '../providers/geminiProvider.ts';
import type { ReferenceImageInput, RegionSelection } from '../providers/types.ts';
import { buildProjectZipBuffer, buildStoryboardPdfBuffer } from '../services/exportService.ts';
import { logError, logInfo } from '../services/logger.ts';
import { parseScreenplayBuffer } from '../services/screenplayParser.ts';
import { resolveGeminiCredential } from '../services/secretStore.ts';
import {
  ensureCharacterDirectoryStructure,
  ensureProjectDirectoryStructure,
  readProjectImageBase64,
  resolveConfinedPath,
  sanitizeSlug,
  saveProjectImageFile,
  savePromptArchive,
  saveScreenplaySourceFile,
} from '../services/storage.ts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB max
});

let lastProviderCheck: { at: string; ok: boolean; message: string } | null = null;

function asyncHandler(fn: (req: Request, res: Response) => Promise<void> | void) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

function getProjectOr404(projectId: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return mapProjectRow(row, db);
}

function loadReferenceImages(projectId: string, projectDir: string, imageIds: string[]): ReferenceImageInput[] {
  if (!Array.isArray(imageIds) || imageIds.length === 0) return [];
  const db = getDb();
  const refs: ReferenceImageInput[] = [];

  for (const imgId of imageIds.slice(0, 6)) {
    const row = db
      .prepare('SELECT * FROM images WHERE id = ? AND project_id = ?')
      .get(imgId, projectId) as Record<string, unknown> | undefined;
    if (!row) continue;
    const hydrated = hydrateImage(row, db);
    if (!hydrated.officialVersion) continue;
    const encoded = readProjectImageBase64(projectDir, hydrated.officialVersion.filePath);
    if (!encoded) continue;
    refs.push({
      id: hydrated.id,
      label: hydrated.title,
      mimeType: encoded.mimeType,
      base64Data: encoded.data,
    });
  }
  return refs;
}

export function createApiRouter(): express.Router {
  const router = express.Router();

  // ---------------- Health & Settings ----------------
  router.get('/health', (_req, res) => {
    res.json({ ok: true, app: 'CineStudio AI', timestamp: new Date().toISOString() });
  });

  router.get(
    '/settings',
    asyncHandler((_req, res) => {
      res.json(getSettings());
    })
  );

  router.put(
    '/settings',
    asyncHandler((req, res) => {
      const current = getSettings();
      const body = req.body as Partial<StudioSettings>;
      const updated: StudioSettings = {
        ...current,
        language: body.language === 'en' ? 'en' : body.language === 'fr' ? 'fr' : current.language,
        projectsRoot:
          typeof body.projectsRoot === 'string' && body.projectsRoot.trim()
            ? path.resolve(body.projectsRoot.trim())
            : current.projectsRoot,
        defaultModel: body.defaultModel ?? current.defaultModel,
        defaultAspectRatio: body.defaultAspectRatio ?? current.defaultAspectRatio,
        defaultResolution: body.defaultResolution ?? current.defaultResolution,
        currency: body.currency === 'EUR' ? 'EUR' : body.currency === 'USD' ? 'USD' : current.currency,
        eurExchangeRate:
          typeof body.eurExchangeRate === 'number' && body.eurExchangeRate > 0
            ? body.eurExchangeRate
            : current.eurExchangeRate,
        activeProjectId:
          body.activeProjectId !== undefined ? body.activeProjectId : current.activeProjectId,
        pricingTable:
          Array.isArray(body.pricingTable) && body.pricingTable.length > 0
            ? body.pricingTable
            : current.pricingTable,
      };
      saveSettings(updated);
      res.json(updated);
    })
  );

  // ---------------- Provider Status & Connection Verification ----------------
  router.get(
    '/provider/status',
    asyncHandler((_req, res) => {
      const settings = getSettings();
      const cred = resolveGeminiCredential();
      const status: ProviderStatus = {
        providerId: geminiImageProvider.id,
        providerName: geminiImageProvider.name,
        configured: Boolean(cred.apiKey),
        source: cred.source,
        maskedKeyPreview: cred.maskedPreview,
        lastCheckedAt: lastProviderCheck?.at ?? null,
        connectionOk: lastProviderCheck ? lastProviderCheck.ok : null,
        connectionMessage: lastProviderCheck?.message ?? null,
        models: geminiImageProvider.listModels(settings),
        textModel: GEMINI_TEXT_MODEL,
        requiresInternet: true,
      };
      res.json(status);
    })
  );

  router.post(
    '/provider/test',
    asyncHandler(async (_req, res) => {
      const result = await geminiImageProvider.checkAvailability();
      lastProviderCheck = {
        at: result.checkedAt,
        ok: result.available,
        message: result.message,
      };
      res.json(result);
    })
  );

  // ---------------- Dashboard ----------------
  router.get(
    '/dashboard',
    asyncHandler((_req, res) => {
      const db = getDb();
      const settings = getSettings(db);
      const projectRows = db
        .prepare('SELECT * FROM projects ORDER BY updated_at DESC')
        .all() as Record<string, unknown>[];
      const projects = projectRows.map((r) => mapProjectRow(r, db));

      const recentImageRows = db
        .prepare('SELECT * FROM images ORDER BY created_at DESC LIMIT 8')
        .all() as Record<string, unknown>[];
      const recentImages = recentImageRows.map((r) => hydrateImage(r, db));

      const recentActivity = (
        db.prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 12').all() as Record<
          string,
          unknown
        >[]
      ).map((r) => ({
        id: String(r.id),
        projectId: r.project_id ? String(r.project_id) : null,
        module: String(r.module),
        action: String(r.action),
        details: String(r.details),
        createdAt: String(r.created_at),
      }));

      const totalCostRow = db
        .prepare(
          'SELECT COALESCE(SUM(estimated_cost_usd), 0) as totalUsd, COALESCE(SUM(image_count), 0) as totalImages FROM cost_logs'
        )
        .get() as { totalUsd: number; totalImages: number };

      res.json({
        projects,
        activeProjectId: settings.activeProjectId ?? projects[0]?.id ?? null,
        recentImages,
        recentActivity,
        totalEstimatedCostUsd: Number(totalCostRow.totalUsd.toFixed(4)),
        totalGeneratedImages: totalCostRow.totalImages,
      });
    })
  );

  // ---------------- Projects CRUD + Backup + ZIP Export/Import ----------------
  router.get(
    '/projects',
    asyncHandler((_req, res) => {
      const db = getDb();
      const rows = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as Record<
        string,
        unknown
      >[];
      res.json(rows.map((r) => mapProjectRow(r, db)));
    })
  );

  router.post(
    '/projects',
    asyncHandler((req, res) => {
      const db = getDb();
      const settings = getSettings(db);
      const title = String(req.body?.title ?? '').trim();
      if (!title) {
        res.status(400).json({ error: 'Le titre du projet est requis.' });
        return;
      }

      const id = crypto.randomUUID();
      const baseSlug = sanitizeSlug(title, 'projet');
      const existingCount = (
        db.prepare('SELECT COUNT(*) as c FROM projects WHERE slug LIKE ?').get(`${baseSlug}%`) as {
          c: number;
        }
      ).c;
      const slug = existingCount > 0 ? `${baseSlug}_${existingCount + 1}` : baseSlug;
      const folderPath = ensureProjectDirectoryStructure(settings.projectsRoot, slug);
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO projects (id, slug, title, logline, genre, director, aspect_ratio, visual_tone, status, folder_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        slug,
        title,
        String(req.body?.logline ?? ''),
        String(req.body?.genre ?? 'Drame cinématographique'),
        String(req.body?.director ?? ''),
        (req.body?.aspectRatio as AspectRatio) ?? settings.defaultAspectRatio ?? '16:9',
        String(req.body?.visualTone ?? 'Réalisme cinématographique 35mm, lumière naturelle motivée'),
        req.body?.status ?? 'prep',
        folderPath,
        now,
        now
      );

      // Set newly created project as active
      saveSettings({ ...settings, activeProjectId: id }, db);
      logActivity(id, 'projects', 'create', `Projet créé : ${title}`, db);
      syncProjectDiskSnapshot(id, db);

      const created = getProjectOr404(id);
      logInfo('projects', 'Created project', { id, slug });
      res.status(201).json(created);
    })
  );

  router.put(
    '/projects/:id',
    asyncHandler((req, res) => {
      const db = getDb();
      const existing = getProjectOr404(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Projet introuvable.' });
        return;
      }
      const now = new Date().toISOString();
      db.prepare(
        `UPDATE projects SET title = ?, logline = ?, genre = ?, director = ?, aspect_ratio = ?, visual_tone = ?, status = ?, updated_at = ? WHERE id = ?`
      ).run(
        String(req.body?.title ?? existing.title).trim() || existing.title,
        String(req.body?.logline ?? existing.logline),
        String(req.body?.genre ?? existing.genre),
        String(req.body?.director ?? existing.director),
        req.body?.aspectRatio ?? existing.aspectRatio,
        String(req.body?.visualTone ?? existing.visualTone),
        req.body?.status ?? existing.status,
        now,
        existing.id
      );

      logActivity(existing.id, 'projects', 'update', `Projet mis à jour : ${req.body?.title ?? existing.title}`, db);
      syncProjectDiskSnapshot(existing.id, db);
      res.json(getProjectOr404(existing.id));
    })
  );

  router.delete(
    '/projects/:id',
    asyncHandler((req, res) => {
      const db = getDb();
      const existing = getProjectOr404(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Projet introuvable.' });
        return;
      }
      db.prepare('DELETE FROM projects WHERE id = ?').run(existing.id);
      const settings = getSettings(db);
      if (settings.activeProjectId === existing.id) {
        const nextRow = db.prepare('SELECT id FROM projects ORDER BY updated_at DESC LIMIT 1').get() as
          | { id: string }
          | undefined;
        saveSettings({ ...settings, activeProjectId: nextRow?.id ?? null }, db);
      }
      logActivity(null, 'projects', 'delete', `Projet supprimé de la base : ${existing.title}`, db);
      res.json({ ok: true });
    })
  );

  router.post(
    '/projects/:id/backup',
    asyncHandler((req, res) => {
      const existing = getProjectOr404(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Projet introuvable.' });
        return;
      }
      syncProjectDiskSnapshot(existing.id);
      logActivity(existing.id, 'projects', 'backup', `Sauvegarde locale synchronisée dans ${existing.folderPath}`);
      res.json({ ok: true, folderPath: existing.folderPath, savedAt: new Date().toISOString() });
    })
  );

  router.get(
    '/projects/:id/export-zip',
    asyncHandler(async (req, res) => {
      const { filename, buffer } = await buildProjectZipBuffer(req.params.id);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    })
  );

  router.post(
    '/projects/import-zip',
    upload.single('file'),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        res.status(400).json({ error: 'Aucun fichier ZIP fourni.' });
        return;
      }
      const db = getDb();
      const settings = getSettings(db);
      const zip = await JSZip.loadAsync(req.file.buffer);
      const projectJsonFile = zip.file('project.json');
      if (!projectJsonFile) {
        res.status(400).json({ error: 'Archive invalide : fichier project.json introuvable.' });
        return;
      }

      const rawJson = await projectJsonFile.async('string');
      const snapshot = JSON.parse(rawJson) as {
        project?: Record<string, unknown>;
        characters?: Record<string, unknown>[];
        outfits?: Record<string, unknown>[];
        locations?: Record<string, unknown>[];
        screenplays?: Record<string, unknown>[];
        scenes?: Record<string, unknown>[];
        shots?: Record<string, unknown>[];
        images?: Array<{
          id: string;
          entityType: string;
          entityId: string | null;
          title: string;
          officialVersionId: string | null;
          versions?: Array<Record<string, unknown>>;
        }>;
      };

      if (!snapshot.project?.title) {
        res.status(400).json({ error: 'Fichier project.json corrompu.' });
        return;
      }

      const newProjectId = crypto.randomUUID();
      const baseSlug = sanitizeSlug(String(snapshot.project.title), 'projet_importe');
      const newSlug = `${baseSlug}_${Date.now().toString(36).slice(-4)}`;
      const projectDir = ensureProjectDirectoryStructure(settings.projectsRoot, newSlug);
      const now = new Date().toISOString();

      // Extract non-credential files safely inside projectDir
      const blocked = new Set(['.env', '.env.local', 'credentials.json', 'secrets.json']);
      for (const [entryPath, zipObj] of Object.entries(zip.files)) {
        if (zipObj.dir) continue;
        const baseName = path.basename(entryPath).toLowerCase();
        if (blocked.has(baseName) || entryPath.includes('..')) continue;
        try {
          const dest = resolveConfinedPath(projectDir, entryPath);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          const content = await zipObj.async('nodebuffer');
          fs.writeFileSync(dest, content);
        } catch {
          // Skip invalid paths
        }
      }

      db.prepare(
        `INSERT INTO projects (id, slug, title, logline, genre, director, aspect_ratio, visual_tone, status, folder_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newProjectId,
        newSlug,
        `${String(snapshot.project.title)} (Importé)`,
        String(snapshot.project.logline ?? ''),
        String(snapshot.project.genre ?? ''),
        String(snapshot.project.director ?? ''),
        String(snapshot.project.aspectRatio ?? '16:9'),
        String(snapshot.project.visualTone ?? ''),
        String(snapshot.project.status ?? 'prep'),
        projectDir,
        now,
        now
      );

      // Map old IDs to fresh UUIDs to prevent collisions
      const idMap = new Map<string, string>();
      const mapId = (oldId: unknown) => {
        if (!oldId || typeof oldId !== 'string') return null;
        if (!idMap.has(oldId)) idMap.set(oldId, crypto.randomUUID());
        return idMap.get(oldId)!;
      };

      for (const c of snapshot.characters ?? []) {
        const cid = mapId(c.id) ?? crypto.randomUUID();
        db.prepare(
          `INSERT INTO characters (id, project_id, slug, name, role, apparent_age, gender, origin_and_traits, height, build, skin_tone, face_shape, eyes, hair, hairstyle, facial_hair, physical_marks, personality, expressions, visual_particularities, free_description, identity_locked, official_reference_ids_json, primary_image_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          cid,
          newProjectId,
          sanitizeSlug(String(c.name ?? 'char')),
          String(c.name ?? 'Personnage'),
          String(c.role ?? ''),
          String(c.apparentAge ?? ''),
          String(c.gender ?? ''),
          String(c.originAndTraits ?? ''),
          String(c.height ?? ''),
          String(c.build ?? ''),
          String(c.skinTone ?? ''),
          String(c.faceShape ?? ''),
          String(c.eyes ?? ''),
          String(c.hair ?? ''),
          String(c.hairstyle ?? ''),
          String(c.facialHair ?? ''),
          String(c.physicalMarks ?? ''),
          String(c.personality ?? ''),
          String(c.expressions ?? ''),
          String(c.visualParticularities ?? ''),
          String(c.freeDescription ?? ''),
          c.identityLocked ? 1 : 0,
          JSON.stringify(
            Array.isArray(c.officialReferenceIds)
              ? c.officialReferenceIds.map((x) => mapId(x)).filter(Boolean)
              : []
          ),
          mapId(c.primaryImageId),
          now,
          now
        );
      }

      for (const o of snapshot.outfits ?? []) {
        const oid = mapId(o.id) ?? crypto.randomUUID();
        const cid = mapId(o.characterId);
        if (!cid) continue;
        db.prepare(
          `INSERT INTO outfits (id, project_id, character_id, name, category, description, fabrics_and_colors, accessories, scene_notes, reference_image_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          oid,
          newProjectId,
          cid,
          String(o.name ?? 'Tenue'),
          String(o.category ?? 'daily'),
          String(o.description ?? ''),
          String(o.fabricsAndColors ?? ''),
          String(o.accessories ?? ''),
          String(o.sceneNotes ?? ''),
          mapId(o.referenceImageId),
          now,
          now
        );
      }

      for (const l of snapshot.locations ?? []) {
        const lid = mapId(l.id) ?? crypto.randomUUID();
        db.prepare(
          `INSERT INTO locations (id, project_id, slug, name, description, location_type, setting_real_or_fictional, ambiance, lighting, architecture, color_palette, reference_image_ids_json, primary_image_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          lid,
          newProjectId,
          sanitizeSlug(String(l.name ?? 'loc')),
          String(l.name ?? 'Lieu'),
          String(l.description ?? ''),
          String(l.locationType ?? 'interior_set'),
          String(l.settingRealOrFictional ?? ''),
          String(l.ambiance ?? ''),
          String(l.lighting ?? ''),
          String(l.architecture ?? ''),
          String(l.colorPalette ?? ''),
          JSON.stringify(
            Array.isArray(l.referenceImageIds)
              ? l.referenceImageIds.map((x) => mapId(x)).filter(Boolean)
              : []
          ),
          mapId(l.primaryImageId),
          now,
          now
        );
      }

      for (const sp of snapshot.screenplays ?? []) {
        const sid = mapId(sp.id) ?? crypto.randomUUID();
        db.prepare(
          `INSERT INTO screenplays (id, project_id, title, source_filename, source_format, original_text, working_text, analysis_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          sid,
          newProjectId,
          String(sp.title ?? 'Scénario'),
          sp.sourceFilename ? String(sp.sourceFilename) : null,
          String(sp.sourceFormat ?? 'pasted'),
          String(sp.originalText ?? ''),
          String(sp.workingText ?? sp.originalText ?? ''),
          sp.analysis ? JSON.stringify(sp.analysis) : null,
          now,
          now
        );
      }

      for (const sc of snapshot.scenes ?? []) {
        const scid = mapId(sc.id) ?? crypto.randomUUID();
        db.prepare(
          `INSERT INTO scenes (id, project_id, screenplay_id, sort_order, title, description, location_id, location_name, time_of_day, character_ids_json, outfit_assignments_json, actions, dialogues, emotions, ambiance, lighting, framing, visual_goal, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          scid,
          newProjectId,
          mapId(sc.screenplayId),
          Number(sc.sortOrder ?? 1),
          String(sc.title ?? 'Scène'),
          String(sc.description ?? ''),
          mapId(sc.locationId),
          String(sc.locationName ?? ''),
          String(sc.timeOfDay ?? 'Jour'),
          JSON.stringify(
            Array.isArray(sc.characterIds) ? sc.characterIds.map((x) => mapId(x)).filter(Boolean) : []
          ),
          '{}',
          String(sc.actions ?? ''),
          String(sc.dialogues ?? ''),
          String(sc.emotions ?? ''),
          String(sc.ambiance ?? ''),
          String(sc.lighting ?? ''),
          String(sc.framing ?? ''),
          String(sc.visualGoal ?? ''),
          now,
          now
        );
      }

      for (const sh of snapshot.shots ?? []) {
        const shid = mapId(sh.id) ?? crypto.randomUUID();
        const scid = mapId(sh.sceneId);
        if (!scid) continue;
        db.prepare(
          `INSERT INTO storyboard_shots (id, project_id, scene_id, shot_number, sort_order, action_description, visible_character_ids_json, expression, pose, outfit_notes, location_id, framing, camera_angle, composition, lighting, ambiance, duration_sec, prompt, official_image_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          shid,
          newProjectId,
          scid,
          Number(sh.shotNumber ?? 1),
          Number(sh.sortOrder ?? 1),
          String(sh.actionDescription ?? ''),
          JSON.stringify(
            Array.isArray(sh.visibleCharacterIds)
              ? sh.visibleCharacterIds.map((x) => mapId(x)).filter(Boolean)
              : []
          ),
          String(sh.expression ?? ''),
          String(sh.pose ?? ''),
          String(sh.outfitNotes ?? ''),
          mapId(sh.locationId),
          String(sh.framing ?? 'medium_shot'),
          String(sh.cameraAngle ?? ''),
          String(sh.composition ?? ''),
          String(sh.lighting ?? ''),
          String(sh.ambiance ?? ''),
          Number(sh.durationSec ?? 4),
          String(sh.prompt ?? ''),
          mapId(sh.officialImageId),
          now,
          now
        );
      }

      for (const img of snapshot.images ?? []) {
        const newImgId = mapId(img.id) ?? crypto.randomUUID();
        const newOfficialVerId = mapId(img.officialVersionId);
        db.prepare(
          `INSERT INTO images (id, project_id, entity_type, entity_id, title, official_version_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          newImgId,
          newProjectId,
          String(img.entityType ?? 'free'),
          mapId(img.entityId),
          String(img.title ?? 'Image'),
          newOfficialVerId,
          now,
          now
        );

        for (const v of img.versions ?? []) {
          const newVerId = mapId(v.id) ?? crypto.randomUUID();
          db.prepare(
            `INSERT INTO image_versions (id, image_id, version_number, parent_version_id, file_path, mime_type, prompt, model_id, aspect_ratio, resolution, params_json, reference_image_ids_json, edit_instruction, mask_used, estimated_cost_usd, usage_tokens_json, is_restored_from, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            newVerId,
            newImgId,
            Number(v.versionNumber ?? 1),
            mapId(v.parentVersionId),
            String(v.filePath ?? ''),
            String(v.mimeType ?? 'image/png'),
            String(v.prompt ?? ''),
            String(v.modelId ?? 'gemini-nano-banana-2.1'),
            String(v.aspectRatio ?? '16:9'),
            String(v.resolution ?? '1K'),
            JSON.stringify(v.paramsJson ?? {}),
            '[]',
            v.editInstruction ? String(v.editInstruction) : null,
            v.maskUsed ? 1 : 0,
            Number(v.estimatedCostUsd ?? 0),
            v.usageTokens ? JSON.stringify(v.usageTokens) : null,
            mapId(v.isRestoredFrom),
            String(v.createdAt ?? now)
          );
        }
      }

      saveSettings({ ...settings, activeProjectId: newProjectId }, db);
      syncProjectDiskSnapshot(newProjectId, db);
      logActivity(newProjectId, 'projects', 'import', 'Projet importé depuis une archive ZIP', db);
      res.status(201).json(getProjectOr404(newProjectId));
    })
  );

  // ---------------- Characters ----------------
  router.get(
    '/projects/:projectId/characters',
    asyncHandler((req, res) => {
      const db = getDb();
      const rows = db
        .prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY created_at DESC')
        .all(req.params.projectId) as Record<string, unknown>[];
      res.json(rows.map(mapCharacterRow));
    })
  );

  router.post(
    '/characters/ai-enrich',
    asyncHandler(async (req, res) => {
      const freeDescription = String(req.body?.freeDescription ?? '').trim();
      if (!freeDescription) {
        res.status(400).json({ error: 'Veuillez fournir une description du personnage.' });
        return;
      }
      const settings = getSettings();
      const enriched = await enrichCharacterWithGemini(freeDescription, settings.language);
      res.json(enriched);
    })
  );

  router.post(
    '/projects/:projectId/characters',
    asyncHandler((req, res) => {
      const db = getDb();
      const project = getProjectOr404(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: 'Projet introuvable.' });
        return;
      }
      const name = String(req.body?.name ?? '').trim();
      if (!name) {
        res.status(400).json({ error: 'Le nom du personnage est requis.' });
        return;
      }

      const id = crypto.randomUUID();
      const slug = `${sanitizeSlug(name, 'character')}_${id.slice(0, 6)}`;
      ensureCharacterDirectoryStructure(project.folderPath, slug);
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO characters (id, project_id, slug, name, role, apparent_age, gender, origin_and_traits, height, build, skin_tone, face_shape, eyes, hair, hairstyle, facial_hair, physical_marks, personality, expressions, visual_particularities, free_description, identity_locked, official_reference_ids_json, primary_image_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '[]', NULL, ?, ?)`
      ).run(
        id,
        project.id,
        slug,
        name,
        String(req.body?.role ?? ''),
        String(req.body?.apparentAge ?? ''),
        String(req.body?.gender ?? ''),
        String(req.body?.originAndTraits ?? ''),
        String(req.body?.height ?? ''),
        String(req.body?.build ?? ''),
        String(req.body?.skinTone ?? ''),
        String(req.body?.faceShape ?? ''),
        String(req.body?.eyes ?? ''),
        String(req.body?.hair ?? ''),
        String(req.body?.hairstyle ?? ''),
        String(req.body?.facialHair ?? ''),
        String(req.body?.physicalMarks ?? ''),
        String(req.body?.personality ?? ''),
        String(req.body?.expressions ?? ''),
        String(req.body?.visualParticularities ?? ''),
        String(req.body?.freeDescription ?? ''),
        now,
        now
      );

      logActivity(project.id, 'characters', 'create', `Personnage créé : ${name}`, db);
      syncProjectDiskSnapshot(project.id, db);
      const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as Record<string, unknown>;
      res.status(201).json(mapCharacterRow(row));
    })
  );

  router.put(
    '/characters/:id',
    asyncHandler((req, res) => {
      const db = getDb();
      const existingRow = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
      if (!existingRow) {
        res.status(404).json({ error: 'Personnage introuvable.' });
        return;
      }
      const existing = mapCharacterRow(existingRow);
      const now = new Date().toISOString();

      // Prevent silent alteration of physical identity fields if locked unless explicitly unlocking
      const nextLocked =
        typeof req.body?.identityLocked === 'boolean'
          ? req.body.identityLocked
          : existing.identityLocked;

      const officialReferenceIds = Array.isArray(req.body?.officialReferenceIds)
        ? req.body.officialReferenceIds
        : existing.officialReferenceIds;

      db.prepare(
        `UPDATE characters SET
          name = ?, role = ?, apparent_age = ?, gender = ?, origin_and_traits = ?, height = ?, build = ?,
          skin_tone = ?, face_shape = ?, eyes = ?, hair = ?, hairstyle = ?, facial_hair = ?, physical_marks = ?,
          personality = ?, expressions = ?, visual_particularities = ?, free_description = ?,
          identity_locked = ?, official_reference_ids_json = ?, primary_image_id = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        String(req.body?.name ?? existing.name),
        String(req.body?.role ?? existing.role),
        String(req.body?.apparentAge ?? existing.apparentAge),
        String(req.body?.gender ?? existing.gender),
        String(req.body?.originAndTraits ?? existing.originAndTraits),
        String(req.body?.height ?? existing.height),
        String(req.body?.build ?? existing.build),
        String(req.body?.skinTone ?? existing.skinTone),
        String(req.body?.faceShape ?? existing.faceShape),
        String(req.body?.eyes ?? existing.eyes),
        String(req.body?.hair ?? existing.hair),
        String(req.body?.hairstyle ?? existing.hairstyle),
        String(req.body?.facialHair ?? existing.facialHair),
        String(req.body?.physicalMarks ?? existing.physicalMarks),
        String(req.body?.personality ?? existing.personality),
        String(req.body?.expressions ?? existing.expressions),
        String(req.body?.visualParticularities ?? existing.visualParticularities),
        String(req.body?.freeDescription ?? existing.freeDescription),
        nextLocked ? 1 : 0,
        JSON.stringify(officialReferenceIds),
        req.body?.primaryImageId !== undefined ? req.body.primaryImageId : existing.primaryImageId,
        now,
        existing.id
      );

      logActivity(
        existing.projectId,
        'characters',
        nextLocked !== existing.identityLocked ? (nextLocked ? 'lock' : 'unlock') : 'update',
        `Personnage mis à jour : ${req.body?.name ?? existing.name}`,
        db
      );
      syncProjectDiskSnapshot(existing.projectId, db);
      const updated = db.prepare('SELECT * FROM characters WHERE id = ?').get(existing.id) as Record<
        string,
        unknown
      >;
      res.json(mapCharacterRow(updated));
    })
  );

  router.delete(
    '/characters/:id',
    asyncHandler((req, res) => {
      const db = getDb();
      const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        res.status(404).json({ error: 'Personnage introuvable.' });
        return;
      }
      const char = mapCharacterRow(row);
      db.prepare('DELETE FROM characters WHERE id = ?').run(char.id);
      syncProjectDiskSnapshot(char.projectId, db);
      logActivity(char.projectId, 'characters', 'delete', `Personnage supprimé : ${char.name}`, db);
      res.json({ ok: true });
    })
  );

  // ---------------- Outfits ----------------
  router.get(
    '/projects/:projectId/outfits',
    asyncHandler((req, res) => {
      const db = getDb();
      const rows = db
        .prepare('SELECT * FROM outfits WHERE project_id = ? ORDER BY created_at DESC')
        .all(req.params.projectId) as Record<string, unknown>[];
      res.json(rows.map(mapOutfitRow));
    })
  );

  router.post(
    '/projects/:projectId/outfits',
    asyncHandler((req, res) => {
      const db = getDb();
      const project = getProjectOr404(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: 'Projet introuvable.' });
        return;
      }
      const name = String(req.body?.name ?? '').trim();
      const characterId = String(req.body?.characterId ?? '').trim();
      if (!name || !characterId) {
        res.status(400).json({ error: 'Nom de tenue et personnage requis.' });
        return;
      }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO outfits (id, project_id, character_id, name, category, description, fabrics_and_colors, accessories, scene_notes, reference_image_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
      ).run(
        id,
        project.id,
        characterId,
        name,
        req.body?.category ?? 'daily',
        String(req.body?.description ?? ''),
        String(req.body?.fabricsAndColors ?? ''),
        String(req.body?.accessories ?? ''),
        String(req.body?.sceneNotes ?? ''),
        now,
        now
      );

      syncProjectDiskSnapshot(project.id, db);
      logActivity(project.id, 'outfits', 'create', `Tenue ajoutée : ${name}`, db);
      const row = db.prepare('SELECT * FROM outfits WHERE id = ?').get(id) as Record<string, unknown>;
      res.status(201).json(mapOutfitRow(row));
    })
  );

  router.put(
    '/outfits/:id',
    asyncHandler((req, res) => {
      const db = getDb();
      const existingRow = db.prepare('SELECT * FROM outfits WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
      if (!existingRow) {
        res.status(404).json({ error: 'Tenue introuvable.' });
        return;
      }
      const existing = mapOutfitRow(existingRow);
      const now = new Date().toISOString();

      db.prepare(
        `UPDATE outfits SET name = ?, category = ?, description = ?, fabrics_and_colors = ?, accessories = ?, scene_notes = ?, reference_image_id = ?, updated_at = ? WHERE id = ?`
      ).run(
        String(req.body?.name ?? existing.name),
        req.body?.category ?? existing.category,
        String(req.body?.description ?? existing.description),
        String(req.body?.fabricsAndColors ?? existing.fabricsAndColors),
        String(req.body?.accessories ?? existing.accessories),
        String(req.body?.sceneNotes ?? existing.sceneNotes),
        req.body?.referenceImageId !== undefined ? req.body.referenceImageId : existing.referenceImageId,
        now,
        existing.id
      );

      syncProjectDiskSnapshot(existing.projectId, db);
      const updated = db.prepare('SELECT * FROM outfits WHERE id = ?').get(existing.id) as Record<
        string,
        unknown
      >;
      res.json(mapOutfitRow(updated));
    })
  );

  router.delete(
    '/outfits/:id',
    asyncHandler((req, res) => {
      const db = getDb();
      const existingRow = db.prepare('SELECT * FROM outfits WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
      if (!existingRow) {
        res.status(404).json({ error: 'Tenue introuvable.' });
        return;
      }
      const existing = mapOutfitRow(existingRow);
      db.prepare('DELETE FROM outfits WHERE id = ?').run(existing.id);
      syncProjectDiskSnapshot(existing.projectId, db);
      res.json({ ok: true });
    })
  );

  // ---------------- Locations ----------------
  router.get(
    '/projects/:projectId/locations',
    asyncHandler((req, res) => {
      const db = getDb();
      const rows = db
        .prepare('SELECT * FROM locations WHERE project_id = ? ORDER BY created_at DESC')
        .all(req.params.projectId) as Record<string, unknown>[];
      res.json(rows.map(mapLocationRow));
    })
  );

  router.post(
    '/projects/:projectId/locations',
    asyncHandler((req, res) => {
      const db = getDb();
      const project = getProjectOr404(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: 'Projet introuvable.' });
        return;
      }
      const name = String(req.body?.name ?? '').trim();
      if (!name) {
        res.status(400).json({ error: 'Le nom du décor est requis.' });
        return;
      }
      const id = crypto.randomUUID();
      const slug = `${sanitizeSlug(name, 'location')}_${id.slice(0, 6)}`;
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO locations (id, project_id, slug, name, description, location_type, setting_real_or_fictional, ambiance, lighting, architecture, color_palette, reference_image_ids_json, primary_image_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', NULL, ?, ?)`
      ).run(
        id,
        project.id,
        slug,
        name,
        String(req.body?.description ?? ''),
        (req.body?.locationType as LocationType) ?? 'interior_set',
        String(req.body?.settingRealOrFictional ?? ''),
        String(req.body?.ambiance ?? ''),
        String(req.body?.lighting ?? ''),
        String(req.body?.architecture ?? ''),
        String(req.body?.colorPalette ?? ''),
        now,
        now
      );

      syncProjectDiskSnapshot(project.id, db);
      logActivity(project.id, 'locations', 'create', `Décor créé : ${name}`, db);
      const row = db.prepare('SELECT * FROM locations WHERE id = ?').get(id) as Record<string, unknown>;
      res.status(201).json(mapLocationRow(row));
    })
  );

  router.put(
    '/locations/:id',
    asyncHandler((req, res) => {
      const db = getDb();
      const existingRow = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
      if (!existingRow) {
        res.status(404).json({ error: 'Décor introuvable.' });
        return;
      }
      const existing = mapLocationRow(existingRow);
      const now = new Date().toISOString();

      db.prepare(
        `UPDATE locations SET name = ?, description = ?, location_type = ?, setting_real_or_fictional = ?, ambiance = ?, lighting = ?, architecture = ?, color_palette = ?, reference_image_ids_json = ?, primary_image_id = ?, updated_at = ? WHERE id = ?`
      ).run(
        String(req.body?.name ?? existing.name),
        String(req.body?.description ?? existing.description),
        req.body?.locationType ?? existing.locationType,
        String(req.body?.settingRealOrFictional ?? existing.settingRealOrFictional),
        String(req.body?.ambiance ?? existing.ambiance),
        String(req.body?.lighting ?? existing.lighting),
        String(req.body?.architecture ?? existing.architecture),
        String(req.body?.colorPalette ?? existing.colorPalette),
        JSON.stringify(
          Array.isArray(req.body?.referenceImageIds)
            ? req.body.referenceImageIds
            : existing.referenceImageIds
        ),
        req.body?.primaryImageId !== undefined ? req.body.primaryImageId : existing.primaryImageId,
        now,
        existing.id
      );

      syncProjectDiskSnapshot(existing.projectId, db);
      const updated = db.prepare('SELECT * FROM locations WHERE id = ?').get(existing.id) as Record<
        string,
        unknown
      >;
      res.json(mapLocationRow(updated));
    })
  );

  router.delete(
    '/locations/:id',
    asyncHandler((req, res) => {
      const db = getDb();
      const existingRow = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
      if (!existingRow) {
        res.status(404).json({ error: 'Décor introuvable.' });
        return;
      }
      const existing = mapLocationRow(existingRow);
      db.prepare('DELETE FROM locations WHERE id = ?').run(existing.id);
      syncProjectDiskSnapshot(existing.projectId, db);
      res.json({ ok: true });
    })
  );

  // ---------------- Screenplays (Preserve Original + Separate Working Copy) ----------------
  router.get(
    '/projects/:projectId/screenplays',
    asyncHandler((req, res) => {
      const db = getDb();
      const rows = db
        .prepare('SELECT * FROM screenplays WHERE project_id = ? ORDER BY created_at DESC')
        .all(req.params.projectId) as Record<string, unknown>[];
      res.json(rows.map(mapScreenplayRow));
    })
  );

  router.post(
    '/projects/:projectId/screenplays',
    asyncHandler((req, res) => {
      const db = getDb();
      const project = getProjectOr404(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: 'Projet introuvable.' });
        return;
      }
      const title = String(req.body?.title ?? 'Scénario principal').trim();
      const text = String(req.body?.text ?? '').trim();
      if (!text) {
        res.status(400).json({ error: 'Le texte du scénario ne peut pas être vide.' });
        return;
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const sourceFilename = `${sanitizeSlug(title, 'screenplay')}_original.txt`;
      saveScreenplaySourceFile(project.folderPath, sourceFilename, text);

      db.prepare(
        `INSERT INTO screenplays (id, project_id, title, source_filename, source_format, original_text, working_text, analysis_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pasted', ?, ?, NULL, ?, ?)`
      ).run(id, project.id, title, sourceFilename, text, text, now, now);

      syncProjectDiskSnapshot(project.id, db);
      logActivity(project.id, 'screenplays', 'create', `Scénario importé (texte) : ${title}`, db);
      const row = db.prepare('SELECT * FROM screenplays WHERE id = ?').get(id) as Record<string, unknown>;
      res.status(201).json(mapScreenplayRow(row));
    })
  );

  router.post(
    '/projects/:projectId/screenplays/upload',
    upload.single('file'),
    asyncHandler(async (req, res) => {
      const db = getDb();
      const project = getProjectOr404(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: 'Projet introuvable.' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'Aucun fichier scénario sélectionné.' });
        return;
      }

      const parsed = await parseScreenplayBuffer(req.file.originalname, req.file.buffer);
      if (!parsed.text.trim()) {
        res.status(400).json({ error: 'Impossible d’extraire du texte depuis ce fichier.' });
        return;
      }

      const title = String(req.body?.title || path.parse(req.file.originalname).name).trim();
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      // Save original untouched document on disk
      saveScreenplaySourceFile(project.folderPath, req.file.originalname, req.file.buffer);

      db.prepare(
        `INSERT INTO screenplays (id, project_id, title, source_filename, source_format, original_text, working_text, analysis_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
      ).run(
        id,
        project.id,
        title,
        req.file.originalname,
        parsed.format,
        parsed.text,
        parsed.text,
        now,
        now
      );

      syncProjectDiskSnapshot(project.id, db);
      logActivity(
        project.id,
        'screenplays',
        'upload',
        `Scénario importé (${parsed.format.toUpperCase()}) : ${req.file.originalname}`,
        db
      );
      const row = db.prepare('SELECT * FROM screenplays WHERE id = ?').get(id) as Record<string, unknown>;
      res.status(201).json(mapScreenplayRow(row));
    })
  );

  // Updates ONLY working_text — original_text is strictly immutable!
  router.put(
    '/screenplays/:id',
    asyncHandler((req, res) => {
      const db = getDb();
      const existingRow = db.prepare('SELECT * FROM screenplays WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
      if (!existingRow) {
        res.status(404).json({ error: 'Scénario introuvable.' });
        return;
      }
      const existing = mapScreenplayRow(existingRow);
      const now = new Date().toISOString();
      db.prepare('UPDATE screenplays SET title = ?, working_text = ?, updated_at = ? WHERE id = ?').run(
        String(req.body?.title ?? existing.title),
        String(req.body?.workingText ?? existing.workingText),
        now,
        existing.id
      );
      syncProjectDiskSnapshot(existing.projectId, db);
      const updated = db.prepare('SELECT * FROM screenplays WHERE id = ?').get(existing.id) as Record<
        string,
        unknown
      >;
      res.json(mapScreenplayRow(updated));
    })
  );

  router.post(
    '/screenplays/:id/analyze',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const existingRow = db.prepare('SELECT * FROM screenplays WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
      if (!existingRow) {
        res.status(404).json({ error: 'Scénario introuvable.' });
        return;
      }
      const existing = mapScreenplayRow(existingRow);
      const settings = getSettings(db);
      const analysis = await analyzeScreenplayWithGemini(existing.workingText, settings.language);
      const now = new Date().toISOString();

      db.prepare('UPDATE screenplays SET analysis_json = ?, updated_at = ? WHERE id = ?').run(
        JSON.stringify(analysis),
        now,
        existing.id
      );
      syncProjectDiskSnapshot(existing.projectId, db);
      logActivity(
        existing.projectId,
        'screenplays',
        'analyze',
        `Analyse IA terminée : ${analysis.detectedCharacters.length} personnages, ${analysis.proposedScenes.length} scènes`,
        db
      );
      const updated = db.prepare('SELECT * FROM screenplays WHERE id = ?').get(existing.id) as Record<
        string,
        unknown
      >;
      res.json(mapScreenplayRow(updated));
    })
  );

  // Applies user-validated breakdown items from a screenplay analysis
  router.post(
    '/screenplays/:id/apply-analysis',
    asyncHandler((req, res) => {
      const db = getDb();
      const existingRow = db.prepare('SELECT * FROM screenplays WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
      if (!existingRow) {
        res.status(404).json({ error: 'Scénario introuvable.' });
        return;
      }
      const screenplay = mapScreenplayRow(existingRow);
      const project = getProjectOr404(screenplay.projectId);
      if (!project || !screenplay.analysis) {
        res.status(400).json({ error: 'Aucune analyse disponible pour ce scénario.' });
        return;
      }

      const { importCharacters = true, importLocations = true, importScenes = true } = req.body ?? {};
      const now = new Date().toISOString();
      let createdChars = 0;
      let createdLocs = 0;
      let createdScenes = 0;

      const existingChars = (
        db.prepare('SELECT * FROM characters WHERE project_id = ?').all(project.id) as Record<
          string,
          unknown
        >[]
      ).map(mapCharacterRow);
      const charNameToId = new Map<string, string>(
        existingChars.map((c) => [c.name.toLowerCase(), c.id])
      );

      if (importCharacters) {
        for (const dc of screenplay.analysis.detectedCharacters ?? []) {
          if (!dc.name || charNameToId.has(dc.name.toLowerCase())) continue;
          const cid = crypto.randomUUID();
          const slug = `${sanitizeSlug(dc.name, 'char')}_${cid.slice(0, 6)}`;
          ensureCharacterDirectoryStructure(project.folderPath, slug);
          db.prepare(
            `INSERT INTO characters (id, project_id, slug, name, role, free_description, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(cid, project.id, slug, dc.name, dc.role || '', dc.description || '', now, now);
          charNameToId.set(dc.name.toLowerCase(), cid);
          createdChars++;
        }
      }

      const existingLocs = (
        db.prepare('SELECT * FROM locations WHERE project_id = ?').all(project.id) as Record<
          string,
          unknown
        >[]
      ).map(mapLocationRow);
      const locNameToId = new Map<string, string>(
        existingLocs.map((l) => [l.name.toLowerCase(), l.id])
      );

      const allowedLocTypes = new Set([
        'house',
        'apartment',
        'street',
        'restaurant',
        'office',
        'school',
        'hospital',
        'forest',
        'beach',
        'city',
        'village',
        'interior_set',
        'exterior_set',
      ]);

      if (importLocations) {
        for (const dl of screenplay.analysis.detectedLocations ?? []) {
          if (!dl.name || locNameToId.has(dl.name.toLowerCase())) continue;
          const lid = crypto.randomUUID();
          const slug = `${sanitizeSlug(dl.name, 'loc')}_${lid.slice(0, 6)}`;
          const locType = allowedLocTypes.has(dl.type) ? dl.type : 'interior_set';
          db.prepare(
            `INSERT INTO locations (id, project_id, slug, name, description, location_type, ambiance, lighting, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            lid,
            project.id,
            slug,
            dl.name,
            dl.description || '',
            locType,
            dl.ambiance || '',
            dl.lighting || '',
            now,
            now
          );
          locNameToId.set(dl.name.toLowerCase(), lid);
          createdLocs++;
        }
      }

      if (importScenes) {
        const maxOrderRow = db
          .prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM scenes WHERE project_id = ?')
          .get(project.id) as { m: number };
        let order = maxOrderRow.m;

        for (const ps of screenplay.analysis.proposedScenes ?? []) {
          order++;
          const sid = crypto.randomUUID();
          const matchedLocId = ps.locationName
            ? locNameToId.get(ps.locationName.toLowerCase()) ?? null
            : null;
          const matchedCharIds = (ps.characters ?? [])
            .map((name) => charNameToId.get(name.toLowerCase()))
            .filter(Boolean);

          db.prepare(
            `INSERT INTO scenes (id, project_id, screenplay_id, sort_order, title, description, location_id, location_name, time_of_day, character_ids_json, outfit_assignments_json, actions, dialogues, emotions, ambiance, lighting, framing, visual_goal, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            sid,
            project.id,
            screenplay.id,
            order,
            ps.title || `Scène ${order}`,
            ps.visualGoal || '',
            matchedLocId,
            ps.locationName || '',
            ps.timeOfDay || 'Jour',
            JSON.stringify(matchedCharIds),
            ps.actions || '',
            ps.dialogues || '',
            ps.emotions || '',
            ps.ambiance || '',
            ps.lighting || '',
            ps.framing || '',
            ps.visualGoal || '',
            now,
            now
          );
          createdScenes++;
        }
      }

      syncProjectDiskSnapshot(project.id, db);
      logActivity(
        project.id,
        'screenplays',
        'apply_breakdown',
        `Découpage validé : +${createdChars} pers., +${createdLocs} décors, +${createdScenes} scènes`,
        db
      );
      res.json({ createdChars, createdLocs, createdScenes });
    })
  );

  router.delete(
    '/screenplays/:id',
    asyncHandler((req, res) => {
      const db = getDb();
      const row = db.prepare('SELECT * FROM screenplays WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        res.status(404).json({ error: 'Scénario introuvable.' });
        return;
      }
      const sp = mapScreenplayRow(row);
      db.prepare('DELETE FROM screenplays WHERE id = ?').run(sp.id);
      syncProjectDiskSnapshot(sp.projectId, db);
      res.json({ ok: true });
    })
  );

  // ---------------- Scenes ----------------
  router.get(
    '/projects/:projectId/scenes',
    asyncHandler((req, res) => {
      const db = getDb();
      const rows = db
        .prepare('SELECT * FROM scenes WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC')
        .all(req.params.projectId) as Record<string, unknown>[];
      res.json(rows.map(mapSceneRow));
    })
  );

  router.post(
    '/projects/:projectId/scenes/ai-propose',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const description = String(req.body?.description ?? '').trim();
      if (!description) {
        res.status(400).json({ error: 'Veuillez décrire la scène.' });
        return;
      }
      const settings = getSettings(db);
      const characters = (
        db.prepare('SELECT * FROM characters WHERE project_id = ?').all(req.params.projectId) as Record<
          string,
          unknown
        >[]
      ).map(mapCharacterRow);
      const locations = (
        db.prepare('SELECT * FROM locations WHERE project_id = ?').all(req.params.projectId) as Record<
          string,
          unknown
        >[]
      ).map(mapLocationRow);

      const proposal = await proposeSceneWithGemini(description, {
        characters,
        locations,
        language: settings.language,
      });
      res.json(proposal);
    })
  );

  router.post(
    '/projects/:projectId/scenes',
    asyncHandler((req, res) => {
      const db = getDb();
      const project = getProjectOr404(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: 'Projet introuvable.' });
        return;
      }
      const title = String(req.body?.title ?? '').trim();
      if (!title) {
        res.status(400).json({ error: 'Le titre de la scène est requis.' });
        return;
      }
      const maxOrder = (
        db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM scenes WHERE project_id = ?').get(project.id) as {
          m: number;
        }
      ).m;
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO scenes (id, project_id, screenplay_id, sort_order, title, description, location_id, location_name, time_of_day, character_ids_json, outfit_assignments_json, actions, dialogues, emotions, ambiance, lighting, framing, visual_goal, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        project.id,
        req.body?.screenplayId ?? null,
        maxOrder + 1,
        title,
        String(req.body?.description ?? ''),
        req.body?.locationId ?? null,
        String(req.body?.locationName ?? ''),
        String(req.body?.timeOfDay ?? 'Jour'),
        JSON.stringify(Array.isArray(req.body?.characterIds) ? req.body.characterIds : []),
        JSON.stringify(req.body?.outfitAssignments ?? {}),
        String(req.body?.actions ?? ''),
        String(req.body?.dialogues ?? ''),
        String(req.body?.emotions ?? ''),
        String(req.body?.ambiance ?? ''),
        String(req.body?.lighting ?? ''),
        String(req.body?.framing ?? ''),
        String(req.body?.visualGoal ?? ''),
        now,
        now
      );

      syncProjectDiskSnapshot(project.id, db);
      logActivity(project.id, 'scenes', 'create', `Scène créée : ${title}`, db);
      const row = db.prepare('SELECT * FROM scenes WHERE id = ?').get(id) as Record<string, unknown>;
      res.status(201).json(mapSceneRow(row));
    })
  );

  router.put(
    '/scenes/:id',
    asyncHandler((req, res) => {
      const db = getDb();
      const existingRow = db.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
      if (!existingRow) {
        res.status(404).json({ error: 'Scène introuvable.' });
        return;
      }
      const existing = mapSceneRow(existingRow);
      const now = new Date().toISOString();

      db.prepare(
        `UPDATE scenes SET sort_order = ?, title = ?, description = ?, location_id = ?, location_name = ?, time_of_day = ?, character_ids_json = ?, outfit_assignments_json = ?, actions = ?, dialogues = ?, emotions = ?, ambiance = ?, lighting = ?, framing = ?, visual_goal = ?, updated_at = ? WHERE id = ?`
      ).run(
        typeof req.body?.sortOrder === 'number' ? req.body.sortOrder : existing.sortOrder,
        String(req.body?.title ?? existing.title),
        String(req.body?.description ?? existing.description),
        req.body?.locationId !== undefined ? req.body.locationId : existing.locationId,
        String(req.body?.locationName ?? existing.locationName),
        String(req.body?.timeOfDay ?? existing.timeOfDay),
        JSON.stringify(
          Array.isArray(req.body?.characterIds) ? req.body.characterIds : existing.characterIds
        ),
        JSON.stringify(req.body?.outfitAssignments ?? existing.outfitAssignments),
        String(req.body?.actions ?? existing.actions),
        String(req.body?.dialogues ?? existing.dialogues),
        String(req.body?.emotions ?? existing.emotions),
        String(req.body?.ambiance ?? existing.ambiance),
        String(req.body?.lighting ?? existing.lighting),
        String(req.body?.framing ?? existing.framing),
        String(req.body?.visualGoal ?? existing.visualGoal),
        now,
        existing.id
      );

      syncProjectDiskSnapshot(existing.projectId, db);
      const updated = db.prepare('SELECT * FROM scenes WHERE id = ?').get(existing.id) as Record<
        string,
        unknown
      >;
      res.json(mapSceneRow(updated));
    })
  );

  router.delete(
    '/scenes/:id',
    asyncHandler((req, res) => {
      const db = getDb();
      const row = db.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        res.status(404).json({ error: 'Scène introuvable.' });
        return;
      }
      const scene = mapSceneRow(row);
      db.prepare('DELETE FROM scenes WHERE id = ?').run(scene.id);
      syncProjectDiskSnapshot(scene.projectId, db);
      res.json({ ok: true });
    })
  );

  // ---------------- Storyboard Shots + PDF Export ----------------
  router.get(
    '/projects/:projectId/shots',
    asyncHandler((req, res) => {
      const db = getDb();
      const sceneId = req.query.sceneId ? String(req.query.sceneId) : null;
      const rows = (
        sceneId
          ? db
              .prepare(
                'SELECT * FROM storyboard_shots WHERE project_id = ? AND scene_id = ? ORDER BY sort_order ASC, shot_number ASC'
              )
              .all(req.params.projectId, sceneId)
          : db
              .prepare(
                'SELECT * FROM storyboard_shots WHERE project_id = ? ORDER BY scene_id, sort_order ASC, shot_number ASC'
              )
              .all(req.params.projectId)
      ) as Record<string, unknown>[];
      res.json(rows.map(mapShotRow));
    })
  );

  router.post(
    '/scenes/:sceneId/shots/ai-propose',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const sceneRow = db.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.sceneId) as
        | Record<string, unknown>
        | undefined;
      if (!sceneRow) {
        res.status(404).json({ error: 'Scène introuvable.' });
        return;
      }
      const scene = mapSceneRow(sceneRow);
      const settings = getSettings(db);
      const allChars = (
        db.prepare('SELECT * FROM characters WHERE project_id = ?').all(scene.projectId) as Record<
          string,
          unknown
        >[]
      ).map(mapCharacterRow);
      const sceneChars =
        scene.characterIds.length > 0
          ? allChars.filter((c) => scene.characterIds.includes(c.id))
          : allChars;
      const outfits = (
        db.prepare('SELECT * FROM outfits WHERE project_id = ?').all(scene.projectId) as Record<
          string,
          unknown
        >[]
      ).map(mapOutfitRow);
      const locationRow = scene.locationId
        ? (db.prepare('SELECT * FROM locations WHERE id = ?').get(scene.locationId) as
            | Record<string, unknown>
            | undefined)
        : undefined;

      const desiredShotCount =
        typeof req.body?.desiredShotCount === 'number' && req.body.desiredShotCount >= 1
          ? Math.min(16, Math.round(req.body.desiredShotCount))
          : undefined;

      const proposedShots = await proposeStoryboardShotsWithGemini({
        scene,
        characters: sceneChars,
        outfits,
        location: locationRow ? mapLocationRow(locationRow) : null,
        desiredShotCount,
        language: settings.language,
      });

      res.json({ sceneId: scene.id, proposedShots });
    })
  );

  router.post(
    '/projects/:projectId/shots',
    asyncHandler((req, res) => {
      const db = getDb();
      const project = getProjectOr404(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: 'Projet introuvable.' });
        return;
      }
      const sceneId = String(req.body?.sceneId ?? '').trim();
      if (!sceneId) {
        res.status(400).json({ error: 'Scène associée requise.' });
        return;
      }

      const maxRow = db
        .prepare(
          'SELECT COALESCE(MAX(sort_order), 0) as maxSort, COALESCE(MAX(shot_number), 0) as maxNum FROM storyboard_shots WHERE scene_id = ?'
        )
        .get(sceneId) as { maxSort: number; maxNum: number };

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const allowedFramings = new Set([
        'extreme_close_up',
        'close_up',
        'medium_close_up',
        'cowboy_shot',
        'medium_shot',
        'wide_shot',
        'establishing_shot',
        'pov',
      ]);
      const framing: CameraFraming = allowedFramings.has(req.body?.framing)
        ? req.body.framing
        : 'medium_shot';

      db.prepare(
        `INSERT INTO storyboard_shots (id, project_id, scene_id, shot_number, sort_order, action_description, visible_character_ids_json, expression, pose, outfit_notes, location_id, framing, camera_angle, composition, lighting, ambiance, duration_sec, prompt, official_image_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
      ).run(
        id,
        project.id,
        sceneId,
        Number(req.body?.shotNumber ?? maxRow.maxNum + 1),
        maxRow.maxSort + 1,
        String(req.body?.actionDescription ?? ''),
        JSON.stringify(
          Array.isArray(req.body?.visibleCharacterIds) ? req.body.visibleCharacterIds : []
        ),
        String(req.body?.expression ?? ''),
        String(req.body?.pose ?? ''),
        String(req.body?.outfitNotes ?? ''),
        req.body?.locationId ?? null,
        framing,
        String(req.body?.cameraAngle ?? 'Niveau des yeux'),
        String(req.body?.composition ?? ''),
        String(req.body?.lighting ?? ''),
        String(req.body?.ambiance ?? ''),
        Number(req.body?.durationSec ?? 4),
        String(req.body?.prompt ?? ''),
        now,
        now
      );

      syncProjectDiskSnapshot(project.id, db);
      const row = db.prepare('SELECT * FROM storyboard_shots WHERE id = ?').get(id) as Record<
        string,
        unknown
      >;
      res.status(201).json(mapShotRow(row));
    })
  );

  router.put(
    '/shots/:id',
    asyncHandler((req, res) => {
      const db = getDb();
      const existingRow = db.prepare('SELECT * FROM storyboard_shots WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
      if (!existingRow) {
        res.status(404).json({ error: 'Plan introuvable.' });
        return;
      }
      const existing = mapShotRow(existingRow);
      const now = new Date().toISOString();

      db.prepare(
        `UPDATE storyboard_shots SET
          shot_number = ?, sort_order = ?, action_description = ?, visible_character_ids_json = ?,
          expression = ?, pose = ?, outfit_notes = ?, location_id = ?, framing = ?, camera_angle = ?,
          composition = ?, lighting = ?, ambiance = ?, duration_sec = ?, prompt = ?, official_image_id = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        Number(req.body?.shotNumber ?? existing.shotNumber),
        Number(req.body?.sortOrder ?? existing.sortOrder),
        String(req.body?.actionDescription ?? existing.actionDescription),
        JSON.stringify(
          Array.isArray(req.body?.visibleCharacterIds)
            ? req.body.visibleCharacterIds
            : existing.visibleCharacterIds
        ),
        String(req.body?.expression ?? existing.expression),
        String(req.body?.pose ?? existing.pose),
        String(req.body?.outfitNotes ?? existing.outfitNotes),
        req.body?.locationId !== undefined ? req.body.locationId : existing.locationId,
        req.body?.framing ?? existing.framing,
        String(req.body?.cameraAngle ?? existing.cameraAngle),
        String(req.body?.composition ?? existing.composition),
        String(req.body?.lighting ?? existing.lighting),
        String(req.body?.ambiance ?? existing.ambiance),
        Number(req.body?.durationSec ?? existing.durationSec),
        String(req.body?.prompt ?? existing.prompt),
        req.body?.officialImageId !== undefined ? req.body.officialImageId : existing.officialImageId,
        now,
        existing.id
      );

      syncProjectDiskSnapshot(existing.projectId, db);
      const updated = db.prepare('SELECT * FROM storyboard_shots WHERE id = ?').get(existing.id) as Record<
        string,
        unknown
      >;
      res.json(mapShotRow(updated));
    })
  );

  router.post(
    '/shots/:id/duplicate',
    asyncHandler((req, res) => {
      const db = getDb();
      const existingRow = db.prepare('SELECT * FROM storyboard_shots WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
      if (!existingRow) {
        res.status(404).json({ error: 'Plan introuvable.' });
        return;
      }
      const existing = mapShotRow(existingRow);
      const maxRow = db
        .prepare(
          'SELECT COALESCE(MAX(sort_order), 0) as maxSort, COALESCE(MAX(shot_number), 0) as maxNum FROM storyboard_shots WHERE scene_id = ?'
        )
        .get(existing.sceneId) as { maxSort: number; maxNum: number };
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO storyboard_shots (id, project_id, scene_id, shot_number, sort_order, action_description, visible_character_ids_json, expression, pose, outfit_notes, location_id, framing, camera_angle, composition, lighting, ambiance, duration_sec, prompt, official_image_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        existing.projectId,
        existing.sceneId,
        maxRow.maxNum + 1,
        maxRow.maxSort + 1,
        existing.actionDescription,
        JSON.stringify(existing.visibleCharacterIds),
        existing.expression,
        existing.pose,
        existing.outfitNotes,
        existing.locationId,
        existing.framing,
        existing.cameraAngle,
        existing.composition,
        existing.lighting,
        existing.ambiance,
        existing.durationSec,
        existing.prompt,
        existing.officialImageId,
        now,
        now
      );

      syncProjectDiskSnapshot(existing.projectId, db);
      const row = db.prepare('SELECT * FROM storyboard_shots WHERE id = ?').get(id) as Record<
        string,
        unknown
      >;
      res.status(201).json(mapShotRow(row));
    })
  );

  router.post(
    '/scenes/:sceneId/shots/reorder',
    asyncHandler((req, res) => {
      const db = getDb();
      const orderedIds = Array.isArray(req.body?.orderedIds) ? (req.body.orderedIds as string[]) : [];
      const updateStmt = db.prepare(
        'UPDATE storyboard_shots SET sort_order = ?, shot_number = ?, updated_at = ? WHERE id = ? AND scene_id = ?'
      );
      const now = new Date().toISOString();
      const tx = db.transaction(() => {
        orderedIds.forEach((shotId, index) => {
          updateStmt.run(index + 1, index + 1, now, shotId, req.params.sceneId);
        });
      });
      tx();
      res.json({ ok: true });
    })
  );

  router.delete(
    '/shots/:id',
    asyncHandler((req, res) => {
      const db = getDb();
      const row = db.prepare('SELECT * FROM storyboard_shots WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        res.status(404).json({ error: 'Plan introuvable.' });
        return;
      }
      const shot = mapShotRow(row);
      db.prepare('DELETE FROM storyboard_shots WHERE id = ?').run(shot.id);
      syncProjectDiskSnapshot(shot.projectId, db);
      res.json({ ok: true });
    })
  );

  router.get(
    '/projects/:projectId/storyboard-pdf',
    asyncHandler((req, res) => {
      const settings = getSettings();
      const sceneId = req.query.sceneId ? String(req.query.sceneId) : null;
      const { filename, buffer } = buildStoryboardPdfBuffer(
        req.params.projectId,
        sceneId,
        settings.language
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    })
  );

  // ---------------- Image Generation, Editing, History & Versions ----------------
  router.get(
    '/projects/:projectId/images',
    asyncHandler((req, res) => {
      const db = getDb();
      const entityId = req.query.entityId ? String(req.query.entityId) : null;
      const rows = (
        entityId
          ? db
              .prepare(
                'SELECT * FROM images WHERE project_id = ? AND entity_id = ? ORDER BY created_at DESC'
              )
              .all(req.params.projectId, entityId)
          : db
              .prepare('SELECT * FROM images WHERE project_id = ? ORDER BY created_at DESC')
              .all(req.params.projectId)
      ) as Record<string, unknown>[];
      res.json(rows.map((r) => hydrateImage(r, db)));
    })
  );

  router.post(
    '/images/estimate',
    asyncHandler((req, res) => {
      const settings = getSettings();
      const modelId: ImageModelId = req.body?.modelId ?? settings.defaultModel;
      const resolution: ImageResolution = req.body?.resolution ?? settings.defaultResolution;
      const aspectRatio: AspectRatio = req.body?.aspectRatio ?? settings.defaultAspectRatio;
      const variantCount = Math.max(1, Math.min(8, Number(req.body?.variantCount ?? 1)));

      const estimate = geminiImageProvider.estimateCost({
        modelId,
        resolution,
        aspectRatio,
        variantCount,
        settings,
      });
      res.json(estimate);
    })
  );

  router.post(
    '/images/generate',
    asyncHandler(async (req, res) => {
      // Absolute rule #6: never launch paid generation without explicit confirmation
      if (req.body?.confirmed !== true) {
        res.status(400).json({
          error:
            'Confirmation explicite de coût requise (confirmed: true) avant toute génération payante.',
        });
        return;
      }

      const db = getDb();
      const settings = getSettings(db);
      const projectId = String(req.body?.projectId ?? '').trim();
      const project = getProjectOr404(projectId);
      if (!project) {
        res.status(404).json({ error: 'Projet actif introuvable.' });
        return;
      }

      const prompt = String(req.body?.prompt ?? '').trim();
      if (!prompt) {
        res.status(400).json({ error: 'Le prompt de génération ne peut pas être vide.' });
        return;
      }

      const modelId: ImageModelId = req.body?.modelId ?? settings.defaultModel;
      const aspectRatio: AspectRatio = req.body?.aspectRatio ?? project.aspectRatio ?? '16:9';
      const resolution: ImageResolution = req.body?.resolution ?? settings.defaultResolution;
      const variantCount = Math.max(1, Math.min(8, Number(req.body?.variantCount ?? 1)));
      const entityType: ImageEntityType = req.body?.entityType ?? 'free';
      const entityId: string | null = req.body?.entityId ? String(req.body.entityId) : null;
      const title = String(req.body?.title ?? 'Image générée').trim();
      const referenceImageIds: string[] = Array.isArray(req.body?.referenceImageIds)
        ? req.body.referenceImageIds.map(String)
        : [];
      const characterSlug: string | null = req.body?.characterSlug
        ? String(req.body.characterSlug)
        : null;

      const estimate = geminiImageProvider.estimateCost({
        modelId,
        resolution,
        aspectRatio,
        variantCount,
        settings,
      });

      const references = loadReferenceImages(project.id, project.folderPath, referenceImageIds);

      const { outputs, effectivePrompt, effectiveResolution } =
        await geminiImageProvider.generateImages(
          {
            modelId,
            prompt,
            aspectRatio,
            resolution,
            variantCount,
            references,
            enforceCinematicRealism: true,
          },
          settings
        );

      const now = new Date().toISOString();
      const createdImages = [];

      for (let i = 0; i < outputs.length; i++) {
        const out = outputs[i];
        const imageId = crypto.randomUUID();
        const versionId = crypto.randomUUID();
        const ext = out.mimeType.includes('jpeg') ? 'jpg' : 'png';
        const filename = `${sanitizeSlug(title, 'frame')}_${Date.now()}_${i + 1}.${ext}`;

        const saved = saveProjectImageFile({
          projectDir: project.folderPath,
          entityType,
          characterSlug,
          filename,
          buffer: out.buffer,
        });

        db.prepare(
          `INSERT INTO images (id, project_id, entity_type, entity_id, title, official_version_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          imageId,
          project.id,
          entityType,
          entityId,
          outputs.length > 1 ? `${title} #${i + 1}` : title,
          versionId,
          now,
          now
        );

        db.prepare(
          `INSERT INTO image_versions (id, image_id, version_number, parent_version_id, file_path, mime_type, prompt, model_id, aspect_ratio, resolution, params_json, reference_image_ids_json, edit_instruction, mask_used, estimated_cost_usd, usage_tokens_json, is_restored_from, created_at)
           VALUES (?, ?, 1, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, NULL, ?)`
        ).run(
          versionId,
          imageId,
          saved.relativePath,
          out.mimeType,
          prompt,
          modelId,
          aspectRatio,
          effectiveResolution,
          JSON.stringify({ effectivePrompt, modelNotes: out.modelNotes, expertParams: req.body?.expertParams ?? {} }),
          JSON.stringify(referenceImageIds),
          estimate.unitCostUsd,
          out.usageTokens ? JSON.stringify(out.usageTokens) : null,
          now
        );

        savePromptArchive(project.folderPath, imageId, 1, {
          imageId,
          versionId,
          title,
          prompt,
          effectivePrompt,
          modelId,
          aspectRatio,
          resolution: effectiveResolution,
          referenceImageIds,
          createdAt: now,
        });

        const imgRow = db.prepare('SELECT * FROM images WHERE id = ?').get(imageId) as Record<
          string,
          unknown
        >;
        createdImages.push(hydrateImage(imgRow, db));
      }

      // Log cost accurately (never fabricate actual currency cost)
      const totalTokens = outputs.reduce(
        (acc, o) => ({
          promptTokenCount: (acc.promptTokenCount ?? 0) + (o.usageTokens?.promptTokenCount ?? 0),
          candidatesTokenCount:
            (acc.candidatesTokenCount ?? 0) + (o.usageTokens?.candidatesTokenCount ?? 0),
          totalTokenCount: (acc.totalTokenCount ?? 0) + (o.usageTokens?.totalTokenCount ?? 0),
        }),
        { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 }
      );

      db.prepare(
        `INSERT INTO cost_logs (id, project_id, operation, provider_id, model_id, resolution, aspect_ratio, image_count, estimated_cost_usd, currency, actual_cost_known, actual_cost_usd, usage_tokens_json, notes, created_at)
         VALUES (?, ?, 'generate', ?, ?, ?, ?, ?, ?, 'USD', 0, NULL, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        project.id,
        geminiImageProvider.id,
        modelId,
        effectiveResolution,
        aspectRatio,
        outputs.length,
        Number((estimate.unitCostUsd * outputs.length).toFixed(4)),
        totalTokens.totalTokenCount > 0 ? JSON.stringify(totalTokens) : null,
        `Génération : ${title} (${outputs.length} variante${outputs.length > 1 ? 's' : ''})`,
        now
      );

      logActivity(
        project.id,
        'images',
        'generate',
        `${outputs.length} image(s) générée(s) avec ${modelId} (${effectiveResolution})`,
        db
      );
      syncProjectDiskSnapshot(project.id, db);
      res.status(201).json({ images: createdImages, estimate });
    })
  );

  // Non-destructive conversational & regional retouch (ALWAYS creates a new version!)
  router.post(
    '/images/:id/edit',
    asyncHandler(async (req, res) => {
      if (req.body?.confirmed !== true) {
        res.status(400).json({
          error: 'Confirmation explicite de coût requise avant toute retouche payante.',
        });
        return;
      }

      const db = getDb();
      const settings = getSettings(db);
      const imgRow = db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
      if (!imgRow) {
        res.status(404).json({ error: 'Image introuvable.' });
        return;
      }
      const image = hydrateImage(imgRow, db);
      const project = getProjectOr404(image.projectId);
      if (!project) {
        res.status(404).json({ error: 'Projet introuvable.' });
        return;
      }

      const instruction = String(req.body?.instruction ?? '').trim();
      if (!instruction) {
        res.status(400).json({ error: 'Veuillez décrire la retouche souhaitée.' });
        return;
      }

      const baseVersionId = req.body?.baseVersionId
        ? String(req.body.baseVersionId)
        : image.officialVersionId;
      const baseVersion =
        image.versions?.find((v) => v.id === baseVersionId) ?? image.officialVersion;
      if (!baseVersion) {
        res.status(400).json({ error: 'Version source introuvable.' });
        return;
      }

      const sourceEncoded = readProjectImageBase64(project.folderPath, baseVersion.filePath);
      if (!sourceEncoded) {
        res.status(404).json({ error: 'Fichier image source introuvable sur le disque.' });
        return;
      }

      const modelId: ImageModelId = req.body?.modelId ?? baseVersion.modelId ?? settings.defaultModel;
      const resolution: ImageResolution = req.body?.resolution ?? baseVersion.resolution ?? '1K';
      const aspectRatio: AspectRatio = baseVersion.aspectRatio;
      const region: RegionSelection | null = req.body?.region ?? null;
      const referenceImageIds: string[] = Array.isArray(req.body?.referenceImageIds)
        ? req.body.referenceImageIds.map(String)
        : baseVersion.referenceImageIds;

      const estimate = geminiImageProvider.estimateCost({
        modelId,
        resolution,
        aspectRatio,
        variantCount: 1,
        settings,
      });

      const references = loadReferenceImages(project.id, project.folderPath, referenceImageIds);

      const { output, effectivePrompt, effectiveResolution, usedPixelMask, limitationNotice } =
        await geminiImageProvider.editImage(
          {
            modelId,
            sourceImageBase64: sourceEncoded.data,
            sourceMimeType: sourceEncoded.mimeType,
            instruction,
            aspectRatio,
            resolution,
            region,
            references,
          },
          settings
        );

      const nextVerNum =
        Math.max(0, ...(image.versions ?? []).map((v) => v.versionNumber)) + 1;
      const newVersionId = crypto.randomUUID();
      const now = new Date().toISOString();
      const ext = output.mimeType.includes('jpeg') ? 'jpg' : 'png';
      const filename = `${sanitizeSlug(image.title, 'frame')}_v${nextVerNum}_${Date.now()}.${ext}`;

      const saved = saveProjectImageFile({
        projectDir: project.folderPath,
        entityType: image.entityType,
        filename,
        buffer: output.buffer,
      });

      db.prepare(
        `INSERT INTO image_versions (id, image_id, version_number, parent_version_id, file_path, mime_type, prompt, model_id, aspect_ratio, resolution, params_json, reference_image_ids_json, edit_instruction, mask_used, estimated_cost_usd, usage_tokens_json, is_restored_from, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
      ).run(
        newVersionId,
        image.id,
        nextVerNum,
        baseVersion.id,
        saved.relativePath,
        output.mimeType,
        `${baseVersion.prompt}\n[Retouche v${nextVerNum}]: ${instruction}`,
        modelId,
        aspectRatio,
        effectiveResolution,
        JSON.stringify({ effectivePrompt, region, limitationNotice }),
        JSON.stringify(referenceImageIds),
        instruction,
        usedPixelMask ? 1 : 0,
        estimate.unitCostUsd,
        output.usageTokens ? JSON.stringify(output.usageTokens) : null,
        now
      );

      db.prepare('UPDATE images SET official_version_id = ?, updated_at = ? WHERE id = ?').run(
        newVersionId,
        now,
        image.id
      );

      db.prepare(
        `INSERT INTO cost_logs (id, project_id, operation, provider_id, model_id, resolution, aspect_ratio, image_count, estimated_cost_usd, currency, actual_cost_known, actual_cost_usd, usage_tokens_json, notes, created_at)
         VALUES (?, ?, 'edit', ?, ?, ?, ?, 1, ?, 'USD', 0, NULL, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        project.id,
        geminiImageProvider.id,
        modelId,
        effectiveResolution,
        aspectRatio,
        estimate.unitCostUsd,
        output.usageTokens ? JSON.stringify(output.usageTokens) : null,
        `Retouche v${nextVerNum} : ${image.title}`,
        now
      );

      logActivity(
        project.id,
        'images',
        'edit',
        `Nouvelle version v${nextVerNum} créée par retouche pour ${image.title}`,
        db
      );
      syncProjectDiskSnapshot(project.id, db);
      const updatedRow = db.prepare('SELECT * FROM images WHERE id = ?').get(image.id) as Record<
        string,
        unknown
      >;
      res.status(201).json({
        image: hydrateImage(updatedRow, db),
        limitationNotice,
      });
    })
  );

  router.post(
    '/images/:id/set-official',
    asyncHandler((req, res) => {
      const db = getDb();
      const versionId = String(req.body?.versionId ?? '').trim();
      const imgRow = db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
      if (!imgRow) {
        res.status(404).json({ error: 'Image introuvable.' });
        return;
      }
      const now = new Date().toISOString();
      db.prepare('UPDATE images SET official_version_id = ?, updated_at = ? WHERE id = ?').run(
        versionId,
        now,
        req.params.id
      );
      syncProjectDiskSnapshot(String(imgRow.project_id), db);
      const updated = db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.id) as Record<
        string,
        unknown
      >;
      res.json(hydrateImage(updated, db));
    })
  );

  // Non-destructive Restore: creates a new restored version pointing to the older version's file
  router.post(
    '/images/:id/restore',
    asyncHandler((req, res) => {
      const db = getDb();
      const sourceVersionId = String(req.body?.versionId ?? '').trim();
      const imgRow = db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
      if (!imgRow) {
        res.status(404).json({ error: 'Image introuvable.' });
        return;
      }
      const image = hydrateImage(imgRow, db);
      const targetVersion = image.versions?.find((v) => v.id === sourceVersionId);
      if (!targetVersion) {
        res.status(404).json({ error: 'Version à restaurer introuvable.' });
        return;
      }

      const nextVerNum =
        Math.max(0, ...(image.versions ?? []).map((v) => v.versionNumber)) + 1;
      const newVersionId = crypto.randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO image_versions (id, image_id, version_number, parent_version_id, file_path, mime_type, prompt, model_id, aspect_ratio, resolution, params_json, reference_image_ids_json, edit_instruction, mask_used, estimated_cost_usd, usage_tokens_json, is_restored_from, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`
      ).run(
        newVersionId,
        image.id,
        nextVerNum,
        targetVersion.id,
        targetVersion.filePath,
        targetVersion.mimeType,
        targetVersion.prompt,
        targetVersion.modelId,
        targetVersion.aspectRatio,
        targetVersion.resolution,
        JSON.stringify(targetVersion.paramsJson),
        JSON.stringify(targetVersion.referenceImageIds),
        `Restauration de v${targetVersion.versionNumber}`,
        targetVersion.maskUsed ? 1 : 0,
        targetVersion.id,
        now
      );

      db.prepare('UPDATE images SET official_version_id = ?, updated_at = ? WHERE id = ?').run(
        newVersionId,
        now,
        image.id
      );

      logActivity(
        image.projectId,
        'images',
        'restore',
        `Version v${targetVersion.versionNumber} restaurée en v${nextVerNum} (${image.title})`,
        db
      );
      syncProjectDiskSnapshot(image.projectId, db);
      const updated = db.prepare('SELECT * FROM images WHERE id = ?').get(image.id) as Record<
        string,
        unknown
      >;
      res.json(hydrateImage(updated, db));
    })
  );

  router.post(
    '/images/:id/duplicate-version',
    asyncHandler((req, res) => {
      const db = getDb();
      const sourceVersionId = String(req.body?.versionId ?? '').trim();
      const imgRow = db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
      if (!imgRow) {
        res.status(404).json({ error: 'Image introuvable.' });
        return;
      }
      const image = hydrateImage(imgRow, db);
      const targetVersion = image.versions?.find((v) => v.id === sourceVersionId);
      if (!targetVersion) {
        res.status(404).json({ error: 'Version introuvable.' });
        return;
      }

      const nextVerNum =
        Math.max(0, ...(image.versions ?? []).map((v) => v.versionNumber)) + 1;
      const newVersionId = crypto.randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO image_versions (id, image_id, version_number, parent_version_id, file_path, mime_type, prompt, model_id, aspect_ratio, resolution, params_json, reference_image_ids_json, edit_instruction, mask_used, estimated_cost_usd, usage_tokens_json, is_restored_from, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?)`
      ).run(
        newVersionId,
        image.id,
        nextVerNum,
        targetVersion.id,
        targetVersion.filePath,
        targetVersion.mimeType,
        targetVersion.prompt,
        targetVersion.modelId,
        targetVersion.aspectRatio,
        targetVersion.resolution,
        JSON.stringify(targetVersion.paramsJson),
        JSON.stringify(targetVersion.referenceImageIds),
        `Duplication de v${targetVersion.versionNumber}`,
        targetVersion.maskUsed ? 1 : 0,
        now
      );

      syncProjectDiskSnapshot(image.projectId, db);
      const updated = db.prepare('SELECT * FROM images WHERE id = ?').get(image.id) as Record<
        string,
        unknown
      >;
      res.json(hydrateImage(updated, db));
    })
  );

  // Manual deletion of a specific version (never automated)
  router.delete(
    '/images/:imageId/versions/:versionId',
    asyncHandler((req, res) => {
      const db = getDb();
      const imgRow = db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.imageId) as
        | Record<string, unknown>
        | undefined;
      if (!imgRow) {
        res.status(404).json({ error: 'Image introuvable.' });
        return;
      }
      const image = hydrateImage(imgRow, db);
      if ((image.versions?.length ?? 0) <= 1) {
        db.prepare('DELETE FROM images WHERE id = ?').run(image.id);
        syncProjectDiskSnapshot(image.projectId, db);
        res.json({ deletedImage: true });
        return;
      }

      db.prepare('DELETE FROM image_versions WHERE id = ? AND image_id = ?').run(
        req.params.versionId,
        image.id
      );
      if (image.officialVersionId === req.params.versionId) {
        const remaining = image.versions?.find((v) => v.id !== req.params.versionId);
        db.prepare('UPDATE images SET official_version_id = ? WHERE id = ?').run(
          remaining?.id ?? null,
          image.id
        );
      }
      syncProjectDiskSnapshot(image.projectId, db);
      const updated = db.prepare('SELECT * FROM images WHERE id = ?').get(image.id) as Record<
        string,
        unknown
      >;
      res.json({ deletedImage: false, image: hydrateImage(updated, db) });
    })
  );

  // Serve project image media safely with strict path confinement
  router.get(
    '/media/:projectId/*',
    asyncHandler((req, res) => {
      const project = getProjectOr404(req.params.projectId);
      if (!project) {
        res.status(404).send('Not found');
        return;
      }
      const wildcard = (req.params as Record<string, string>)[0] ?? '';
      const relPath = decodeURIComponent(wildcard);
      try {
        const absPath = resolveConfinedPath(project.folderPath, relPath);
        if (!fs.existsSync(absPath)) {
          res.status(404).send('File not found');
          return;
        }
        res.sendFile(absPath);
      } catch {
        res.status(400).send('Invalid media path');
      }
    })
  );

  // ---------------- Prompt Templates ----------------
  router.get(
    '/prompt-templates',
    asyncHandler((_req, res) => {
      const db = getDb();
      const rows = db
        .prepare('SELECT * FROM prompt_templates ORDER BY is_built_in DESC, created_at DESC')
        .all() as Record<string, unknown>[];
      res.json(rows.map(mapPromptTemplateRow));
    })
  );

  router.post(
    '/prompt-templates',
    asyncHandler((req, res) => {
      const db = getDb();
      const name = String(req.body?.name ?? '').trim();
      const promptBody = String(req.body?.promptBody ?? '').trim();
      if (!name || !promptBody) {
        res.status(400).json({ error: 'Nom et contenu du modèle de prompt requis.' });
        return;
      }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO prompt_templates (id, name, category, prompt_body, default_framing, default_lighting, is_built_in, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
      ).run(
        id,
        name,
        req.body?.category ?? 'general',
        promptBody,
        String(req.body?.defaultFraming ?? ''),
        String(req.body?.defaultLighting ?? ''),
        now
      );
      const row = db.prepare('SELECT * FROM prompt_templates WHERE id = ?').get(id) as Record<
        string,
        unknown
      >;
      res.status(201).json(mapPromptTemplateRow(row));
    })
  );

  router.delete(
    '/prompt-templates/:id',
    asyncHandler((req, res) => {
      const db = getDb();
      db.prepare('DELETE FROM prompt_templates WHERE id = ? AND is_built_in = 0').run(req.params.id);
      res.json({ ok: true });
    })
  );

  // ---------------- Budget & Consumption ----------------
  router.get(
    '/budget',
    asyncHandler((_req, res) => {
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT cl.*, p.title as project_title
           FROM cost_logs cl
           LEFT JOIN projects p ON p.id = cl.project_id
           ORDER BY cl.created_at DESC LIMIT 200`
        )
        .all() as Record<string, unknown>[];
      const logs = rows.map(mapCostLogRow);

      const byModelRows = db
        .prepare(
          `SELECT model_id, SUM(image_count) as total_images, SUM(estimated_cost_usd) as total_usd
           FROM cost_logs GROUP BY model_id`
        )
        .all() as Array<{ model_id: string; total_images: number; total_usd: number }>;

      const totalEstimatedUsd = logs.reduce((s, l) => s + l.estimatedCostUsd, 0);
      const totalImages = logs.reduce((s, l) => s + l.imageCount, 0);

      res.json({
        logs,
        totalEstimatedUsd: Number(totalEstimatedUsd.toFixed(4)),
        totalImages,
        byModel: byModelRows.map((r) => ({
          modelId: r.model_id,
          totalImages: r.total_images,
          totalEstimatedUsd: Number(r.total_usd.toFixed(4)),
        })),
      });
    })
  );

  // ---------------- Central Semi-Automatic AI Assistant ----------------
  router.get(
    '/projects/:projectId/assistant',
    asyncHandler((req, res) => {
      const db = getDb();
      const rows = db
        .prepare('SELECT * FROM assistant_messages WHERE project_id = ? ORDER BY created_at ASC')
        .all(req.params.projectId) as Record<string, unknown>[];
      res.json(rows.map(mapAssistantMessageRow));
    })
  );

  router.post(
    '/projects/:projectId/assistant/chat',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const project = getProjectOr404(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: 'Projet introuvable.' });
        return;
      }
      const message = String(req.body?.message ?? '').trim();
      if (!message) {
        res.status(400).json({ error: 'Message requis.' });
        return;
      }

      const settings = getSettings(db);
      const now = new Date().toISOString();
      const userMsgId = crypto.randomUUID();
      db.prepare(
        'INSERT INTO assistant_messages (id, project_id, role, content, proposal_json, created_at) VALUES (?, ?, ?, ?, NULL, ?)'
      ).run(userMsgId, project.id, 'user', message, now);

      const historyRows = db
        .prepare('SELECT * FROM assistant_messages WHERE project_id = ? ORDER BY created_at ASC')
        .all(project.id) as Record<string, unknown>[];
      const history = historyRows.map((r) => ({
        role: r.role as 'user' | 'assistant',
        content: String(r.content),
      }));

      const characters = (
        db.prepare('SELECT * FROM characters WHERE project_id = ?').all(project.id) as Record<
          string,
          unknown
        >[]
      ).map(mapCharacterRow);
      const outfits = (
        db.prepare('SELECT * FROM outfits WHERE project_id = ?').all(project.id) as Record<
          string,
          unknown
        >[]
      ).map(mapOutfitRow);
      const locations = (
        db.prepare('SELECT * FROM locations WHERE project_id = ?').all(project.id) as Record<
          string,
          unknown
        >[]
      ).map(mapLocationRow);
      const screenplays = (
        db.prepare('SELECT * FROM screenplays WHERE project_id = ?').all(project.id) as Record<
          string,
          unknown
        >[]
      ).map(mapScreenplayRow);
      const scenes = (
        db.prepare('SELECT * FROM scenes WHERE project_id = ?').all(project.id) as Record<
          string,
          unknown
        >[]
      ).map(mapSceneRow);
      const shotsCount = (
        db
          .prepare('SELECT COUNT(*) as c FROM storyboard_shots WHERE project_id = ?')
          .get(project.id) as { c: number }
      ).c;

      const aiResult = await runCentralAssistantWithGemini({
        userMessage: message,
        history,
        projectContext: {
          projectTitle: project.title,
          logline: project.logline,
          visualTone: project.visualTone,
          characters,
          outfits,
          locations,
          screenplays,
          scenes,
          shotsCount,
        },
        language: settings.language,
      });

      const assistantMsgId = crypto.randomUUID();
      const proposalObj = aiResult.proposal
        ? {
            id: crypto.randomUUID(),
            ...aiResult.proposal,
            status: 'pending' as const,
          }
        : null;

      db.prepare(
        'INSERT INTO assistant_messages (id, project_id, role, content, proposal_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(
        assistantMsgId,
        project.id,
        'assistant',
        aiResult.reply,
        proposalObj ? JSON.stringify(proposalObj) : null,
        new Date().toISOString()
      );

      const savedRow = db
        .prepare('SELECT * FROM assistant_messages WHERE id = ?')
        .get(assistantMsgId) as Record<string, unknown>;
      res.status(201).json(mapAssistantMessageRow(savedRow));
    })
  );

  // Execute a user-approved proposal from the Central Assistant
  router.post(
    '/projects/:projectId/assistant/proposals/:messageId/execute',
    asyncHandler(async (req, res) => {
      const db = getDb();
      const project = getProjectOr404(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: 'Projet introuvable.' });
        return;
      }
      const msgRow = db
        .prepare('SELECT * FROM assistant_messages WHERE id = ? AND project_id = ?')
        .get(req.params.messageId, project.id) as Record<string, unknown> | undefined;
      if (!msgRow) {
        res.status(404).json({ error: 'Message introuvable.' });
        return;
      }
      const msg = mapAssistantMessageRow(msgRow);
      if (!msg.proposal || msg.proposal.status !== 'pending') {
        res.status(400).json({ error: 'Aucune proposition en attente sur ce message.' });
        return;
      }

      const { actionType, payload } = msg.proposal;
      const now = new Date().toISOString();
      let resultSummary = '';

      if (actionType === 'create_character') {
        const cid = crypto.randomUUID();
        const name = String(payload.name ?? 'Nouveau personnage');
        const slug = `${sanitizeSlug(name, 'char')}_${cid.slice(0, 6)}`;
        ensureCharacterDirectoryStructure(project.folderPath, slug);
        db.prepare(
          `INSERT INTO characters (id, project_id, slug, name, role, apparent_age, gender, origin_and_traits, height, build, skin_tone, face_shape, eyes, hair, hairstyle, facial_hair, physical_marks, personality, expressions, visual_particularities, free_description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          cid,
          project.id,
          slug,
          name,
          String(payload.role ?? ''),
          String(payload.apparentAge ?? ''),
          String(payload.gender ?? ''),
          String(payload.originAndTraits ?? ''),
          String(payload.height ?? ''),
          String(payload.build ?? ''),
          String(payload.skinTone ?? ''),
          String(payload.faceShape ?? ''),
          String(payload.eyes ?? ''),
          String(payload.hair ?? ''),
          String(payload.hairstyle ?? ''),
          String(payload.facialHair ?? ''),
          String(payload.physicalMarks ?? ''),
          String(payload.personality ?? ''),
          String(payload.expressions ?? ''),
          String(payload.visualParticularities ?? ''),
          '',
          now,
          now
        );
        resultSummary = `Personnage « ${name} » créé et enregistré.`;
      } else if (actionType === 'create_location') {
        const lid = crypto.randomUUID();
        const name = String(payload.name ?? 'Nouveau décor');
        const slug = `${sanitizeSlug(name, 'loc')}_${lid.slice(0, 6)}`;
        db.prepare(
          `INSERT INTO locations (id, project_id, slug, name, description, location_type, setting_real_or_fictional, ambiance, lighting, architecture, color_palette, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          lid,
          project.id,
          slug,
          name,
          String(payload.description ?? ''),
          String(payload.locationType ?? 'interior_set'),
          String(payload.settingRealOrFictional ?? ''),
          String(payload.ambiance ?? ''),
          String(payload.lighting ?? ''),
          String(payload.architecture ?? ''),
          String(payload.colorPalette ?? ''),
          now,
          now
        );
        resultSummary = `Décor « ${name} » créé et enregistré.`;
      } else if (actionType === 'create_scene') {
        const sid = crypto.randomUUID();
        const title = String(payload.title ?? 'Nouvelle scène');
        const maxOrder = (
          db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM scenes WHERE project_id = ?').get(project.id) as {
            m: number;
          }
        ).m;
        db.prepare(
          `INSERT INTO scenes (id, project_id, sort_order, title, description, location_name, time_of_day, actions, dialogues, emotions, ambiance, lighting, framing, visual_goal, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          sid,
          project.id,
          maxOrder + 1,
          title,
          String(payload.description ?? ''),
          String(payload.locationName ?? ''),
          String(payload.timeOfDay ?? 'Jour'),
          String(payload.actions ?? ''),
          String(payload.dialogues ?? ''),
          String(payload.emotions ?? ''),
          String(payload.ambiance ?? ''),
          String(payload.lighting ?? ''),
          String(payload.framing ?? ''),
          String(payload.visualGoal ?? ''),
          now,
          now
        );
        resultSummary = `Scène « ${title} » ajoutée au Scene Studio.`;
      } else if (actionType === 'create_outfit') {
        const oid = crypto.randomUUID();
        const name = String(payload.name ?? 'Nouvelle tenue');
        const firstChar = db
          .prepare('SELECT id FROM characters WHERE project_id = ? LIMIT 1')
          .get(project.id) as { id: string } | undefined;
        const charId = String(payload.characterId ?? firstChar?.id ?? '');
        if (!charId) {
          res.status(400).json({ error: 'Créez d’abord un personnage avant d’ajouter une tenue.' });
          return;
        }
        db.prepare(
          `INSERT INTO outfits (id, project_id, character_id, name, category, description, fabrics_and_colors, accessories, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          oid,
          project.id,
          charId,
          name,
          String(payload.category ?? 'daily'),
          String(payload.description ?? ''),
          String(payload.fabricsAndColors ?? ''),
          String(payload.accessories ?? ''),
          now,
          now
        );
        resultSummary = `Tenue « ${name} » ajoutée.`;
      } else if (actionType === 'propose_storyboard') {
        const targetSceneId = String(payload.sceneId ?? '');
        const sceneRow = (
          targetSceneId
            ? db.prepare('SELECT * FROM scenes WHERE id = ? AND project_id = ?').get(targetSceneId, project.id)
            : db.prepare('SELECT * FROM scenes WHERE project_id = ? ORDER BY sort_order ASC LIMIT 1').get(project.id)
        ) as Record<string, unknown> | undefined;

        if (!sceneRow) {
          res.status(400).json({ error: 'Aucune scène disponible pour créer un storyboard.' });
          return;
        }
        const scene = mapSceneRow(sceneRow);
        const settings = getSettings(db);
        const chars = (
          db.prepare('SELECT * FROM characters WHERE project_id = ?').all(project.id) as Record<
            string,
            unknown
          >[]
        ).map(mapCharacterRow);
        const outfits = (
          db.prepare('SELECT * FROM outfits WHERE project_id = ?').all(project.id) as Record<
            string,
            unknown
          >[]
        ).map(mapOutfitRow);
        const proposed = await proposeStoryboardShotsWithGemini({
          scene,
          characters: chars,
          outfits,
          location: null,
          desiredShotCount: Number(payload.desiredShotCount) || 6,
          language: settings.language,
        });

        for (let i = 0; i < proposed.length; i++) {
          const sh = proposed[i];
          db.prepare(
            `INSERT INTO storyboard_shots (id, project_id, scene_id, shot_number, sort_order, action_description, expression, pose, outfit_notes, framing, camera_angle, composition, lighting, ambiance, duration_sec, prompt, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            crypto.randomUUID(),
            project.id,
            scene.id,
            i + 1,
            i + 1,
            String(sh.actionDescription ?? ''),
            String(sh.expression ?? ''),
            String(sh.pose ?? ''),
            String(sh.outfitNotes ?? ''),
            String(sh.framing ?? 'medium_shot'),
            String(sh.cameraAngle ?? 'Niveau des yeux'),
            String(sh.composition ?? ''),
            String(sh.lighting ?? ''),
            String(sh.ambiance ?? ''),
            Number(sh.durationSec ?? 4),
            String(sh.prompt ?? ''),
            now,
            now
          );
        }
        resultSummary = `${proposed.length} plans ajoutés au storyboard de « ${scene.title} ».`;
      }

      const updatedProposal = { ...msg.proposal, status: 'executed' as const };
      db.prepare('UPDATE assistant_messages SET proposal_json = ? WHERE id = ?').run(
        JSON.stringify(updatedProposal),
        msg.id
      );

      logActivity(project.id, 'assistant', 'execute_proposal', resultSummary, db);
      syncProjectDiskSnapshot(project.id, db);
      res.json({ ok: true, summary: resultSummary, proposal: updatedProposal });
    })
  );

  router.post(
    '/projects/:projectId/assistant/proposals/:messageId/dismiss',
    asyncHandler((req, res) => {
      const db = getDb();
      const msgRow = db
        .prepare('SELECT * FROM assistant_messages WHERE id = ? AND project_id = ?')
        .get(req.params.messageId, req.params.projectId) as Record<string, unknown> | undefined;
      if (!msgRow) {
        res.status(404).json({ error: 'Message introuvable.' });
        return;
      }
      const msg = mapAssistantMessageRow(msgRow);
      if (msg.proposal) {
        const updatedProposal = { ...msg.proposal, status: 'dismissed' as const };
        db.prepare('UPDATE assistant_messages SET proposal_json = ? WHERE id = ?').run(
          JSON.stringify(updatedProposal),
          msg.id
        );
      }
      res.json({ ok: true });
    })
  );

  // Centralized API Error Handler
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Erreur interne du serveur CineStudio AI.';
    logError('api', message);
    res.status(500).json({ error: message });
  });

  return router;
}
