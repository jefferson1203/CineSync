import fs from 'fs';
import path from 'path';
import { logWarn } from './logger.ts';

export const DEFAULT_PROJECTS_ROOT = path.resolve(process.cwd(), 'CineStudioProjects');

export function sanitizeSlug(input: string, fallback = 'item'): string {
  const cleaned = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return cleaned || fallback;
}

/**
 * Ensures resolvedPath remains strictly confined inside baseDir to prevent path traversal.
 */
export function resolveConfinedPath(baseDir: string, ...segments: string[]): string {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, ...segments);
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new Error('Invalid path: target escapes base directory boundary');
  }
  return resolvedTarget;
}

export function ensureProjectsRoot(projectsRoot: string): string {
  const resolved = path.resolve(projectsRoot || DEFAULT_PROJECTS_ROOT);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

export function ensureProjectDirectoryStructure(projectsRoot: string, projectSlug: string): string {
  const root = ensureProjectsRoot(projectsRoot);
  const projectDir = resolveConfinedPath(root, sanitizeSlug(projectSlug, 'projet'));

  const subdirs = [
    'screenplay',
    'characters',
    'locations',
    'scenes',
    'storyboards',
    'generated_images',
    'prompts',
    'exports',
    'history',
  ];

  fs.mkdirSync(projectDir, { recursive: true });
  for (const sub of subdirs) {
    fs.mkdirSync(resolveConfinedPath(projectDir, sub), { recursive: true });
  }

  return projectDir;
}

export function ensureCharacterDirectoryStructure(projectDir: string, characterSlug: string): string {
  const charDir = resolveConfinedPath(projectDir, 'characters', sanitizeSlug(characterSlug, 'character'));
  for (const sub of ['references', 'outfits', 'expressions', 'poses']) {
    fs.mkdirSync(resolveConfinedPath(charDir, sub), { recursive: true });
  }
  return charDir;
}

export function writeJsonAtomic(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${filePath}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

export function saveProjectImageFile(options: {
  projectDir: string;
  entityType: string;
  characterSlug?: string | null;
  filename: string;
  buffer: Buffer;
}): { relativePath: string; absolutePath: string } {
  const safeName = path.basename(options.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  let relDir = 'generated_images';

  if (options.characterSlug) {
    const slug = sanitizeSlug(options.characterSlug, 'character');
    ensureCharacterDirectoryStructure(options.projectDir, slug);
    if (options.entityType === 'character_portrait' || options.entityType === 'character_fullbody' || options.entityType === 'character_turnaround') {
      relDir = path.join('characters', slug, 'references');
    } else if (options.entityType === 'outfit') {
      relDir = path.join('characters', slug, 'outfits');
    } else if (options.entityType === 'character_expression') {
      relDir = path.join('characters', slug, 'expressions');
    } else if (options.entityType === 'character_pose') {
      relDir = path.join('characters', slug, 'poses');
    }
  } else if (options.entityType === 'location') {
    relDir = 'locations';
  } else if (options.entityType === 'storyboard_shot') {
    relDir = 'storyboards';
  }

  const targetDir = resolveConfinedPath(options.projectDir, relDir);
  fs.mkdirSync(targetDir, { recursive: true });

  const absolutePath = resolveConfinedPath(targetDir, safeName);
  fs.writeFileSync(absolutePath, options.buffer);

  const relativePath = path.relative(options.projectDir, absolutePath).split(path.sep).join('/');
  return { relativePath, absolutePath };
}

export function saveScreenplaySourceFile(
  projectDir: string,
  filename: string,
  content: string | Buffer
): string {
  const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const destDir = resolveConfinedPath(projectDir, 'screenplay');
  fs.mkdirSync(destDir, { recursive: true });
  const absPath = resolveConfinedPath(destDir, safeName);
  fs.writeFileSync(absPath, content);
  return path.relative(projectDir, absPath).split(path.sep).join('/');
}

export function savePromptArchive(projectDir: string, imageId: string, versionNumber: number, payload: unknown): void {
  try {
    const destDir = resolveConfinedPath(projectDir, 'prompts');
    fs.mkdirSync(destDir, { recursive: true });
    const filePath = resolveConfinedPath(destDir, `${sanitizeSlug(imageId)}_v${versionNumber}.json`);
    writeJsonAtomic(filePath, payload);
  } catch (err) {
    logWarn('storage', 'Unable to save prompt archive JSON', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function readProjectImageBase64(projectDir: string, relativePath: string): { data: string; mimeType: string } | null {
  try {
    const absPath = resolveConfinedPath(projectDir, relativePath);
    if (!fs.existsSync(absPath)) return null;
    const buffer = fs.readFileSync(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const mimeType =
      ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/png';
    return {
      data: buffer.toString('base64'),
      mimeType,
    };
  } catch {
    return null;
  }
}
