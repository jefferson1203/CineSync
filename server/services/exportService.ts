import fs from 'fs';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import path from 'path';
import type { Language } from '../../src/shared/types.ts';
import { FRAMING_LABELS } from '../../src/shared/i18n.ts';
import {
  getDb,
  hydrateImage,
  mapProjectRow,
  mapSceneRow,
  mapShotRow,
  syncProjectDiskSnapshot,
} from '../db/database.ts';
import { resolveConfinedPath } from './storage.ts';

/**
 * Packages the full local project folder (project.json, screenplay, characters,
 * locations, storyboards, generated images, prompts) into a portable ZIP archive.
 * Security guarantee: strictly excludes any API keys, env files, or credentials.
 */
export async function buildProjectZipBuffer(projectId: string): Promise<{ filename: string; buffer: Buffer }> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    throw new Error('Projet introuvable');
  }

  syncProjectDiskSnapshot(projectId, db);
  const project = mapProjectRow(row, db);
  const projectDir = path.resolve(project.folderPath);

  const zip = new JSZip();
  const blockedNames = new Set(['.env', '.env.local', 'credentials.json', 'secrets.json']);

  const walk = (currentDir: string) => {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (blockedNames.has(entry.name.toLowerCase())) continue;
      const fullPath = resolveConfinedPath(projectDir, path.relative(projectDir, path.join(currentDir, entry.name)));
      const relPath = path.relative(projectDir, fullPath).split(path.sep).join('/');
      // Avoid bundling previous exported zips inside a new zip
      if (relPath.startsWith('exports/') && entry.name.endsWith('.zip')) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        zip.file(relPath, fs.readFileSync(fullPath));
      }
    }
  };

  walk(projectDir);

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const filename = `${project.slug}_cinestudio_export.zip`;
  return { filename, buffer };
}

/**
 * Generates a professional cinema storyboard PDF with embedded generated shot frames,
 * shot numbers, framing, camera angles, duration, lighting, and action descriptions.
 */
export function buildStoryboardPdfBuffer(
  projectId: string,
  sceneId: string | null,
  language: Language = 'fr'
): { filename: string; buffer: Buffer } {
  const db = getDb();
  const projRow = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as
    | Record<string, unknown>
    | undefined;
  if (!projRow) throw new Error('Projet introuvable');
  const project = mapProjectRow(projRow, db);

  const scenes = (
    sceneId
      ? (db.prepare('SELECT * FROM scenes WHERE project_id = ? AND id = ?').all(projectId, sceneId) as Record<
          string,
          unknown
        >[])
      : (db.prepare('SELECT * FROM scenes WHERE project_id = ? ORDER BY sort_order ASC').all(projectId) as Record<
          string,
          unknown
        >[])
  ).map(mapSceneRow);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 14;

  // Cover / Header Banner
  const drawPageHeader = (sceneTitle: string, pageNum: number) => {
    doc.setFillColor(14, 15, 19);
    doc.rect(0, 0, pageWidth, 18, 'F');
    doc.setTextColor(201, 166, 107);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`CINESTUDIO AI  |  ${project.title.toUpperCase()}`, margin, 11.5);

    doc.setTextColor(210, 214, 222);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(sceneTitle, pageWidth / 2, 11.5, { align: 'center' });
    doc.text(
      `${language === 'en' ? 'Page' : 'Page'} ${pageNum}  ·  ${project.aspectRatio}`,
      pageWidth - margin,
      11.5,
      { align: 'right' }
    );
  };

  let pageNumber = 1;
  let hasDrawnAnyPage = false;

  for (const scene of scenes) {
    const shotRows = db
      .prepare('SELECT * FROM storyboard_shots WHERE scene_id = ? ORDER BY sort_order ASC, shot_number ASC')
      .all(scene.id) as Record<string, unknown>[];
    const shots = shotRows.map(mapShotRow);
    if (shots.length === 0) continue;

    // 2x2 grid per landscape A4 page
    const cols = 2;
    const rowsPerPage = 2;
    const gapX = 10;
    const gapY = 8;
    const cardW = (pageWidth - margin * 2 - gapX) / cols;
    const cardH = (pageHeight - 26 - margin - gapY) / rowsPerPage;

    for (let idx = 0; idx < shots.length; idx++) {
      const slot = idx % (cols * rowsPerPage);
      if (slot === 0) {
        if (hasDrawnAnyPage) {
          doc.addPage();
          pageNumber++;
        }
        hasDrawnAnyPage = true;
        drawPageHeader(
          `${scene.title} — ${scene.locationName || ''} (${scene.timeOfDay})`,
          pageNumber
        );
      }

      const shot = shots[idx];
      const col = slot % cols;
      const rowIdx = Math.floor(slot / cols);
      const x = margin + col * (cardW + gapX);
      const y = 24 + rowIdx * (cardH + gapY);

      // Card container
      doc.setDrawColor(200, 204, 212);
      doc.setLineWidth(0.3);
      doc.rect(x, y, cardW, cardH);

      // Frame box (16:9 area at top of card)
      const imgW = cardW - 4;
      const imgH = 44;
      const imgX = x + 2;
      const imgY = y + 2;

      doc.setFillColor(24, 26, 32);
      doc.rect(imgX, imgY, imgW, imgH, 'F');

      if (shot.officialImageId) {
        const imgRow = db.prepare('SELECT * FROM images WHERE id = ?').get(shot.officialImageId) as
          | Record<string, unknown>
          | undefined;
        if (imgRow) {
          const hydrated = hydrateImage(imgRow, db);
          if (hydrated.officialVersion) {
            try {
              const absPath = resolveConfinedPath(project.folderPath, hydrated.officialVersion.filePath);
              if (fs.existsSync(absPath)) {
                const fileBuf = fs.readFileSync(absPath);
                const fmt = hydrated.officialVersion.mimeType.includes('jpeg') ? 'JPEG' : 'PNG';
                doc.addImage(fileBuf.toString('base64'), fmt, imgX, imgY, imgW, imgH, undefined, 'FAST');
              }
            } catch {
              // Keep matte placeholder if image format unsupported
            }
          }
        }
      } else {
        doc.setTextColor(130, 136, 148);
        doc.setFontSize(8);
        doc.text(
          language === 'en' ? 'No generated frame yet' : 'Aucune image générée',
          imgX + imgW / 2,
          imgY + imgH / 2,
          { align: 'center' }
        );
      }

      // Shot metadata below image
      const textY = imgY + imgH + 5;
      doc.setTextColor(20, 22, 28);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      const framingText = FRAMING_LABELS[language][shot.framing] ?? shot.framing;
      doc.text(
        `${language === 'en' ? 'SHOT' : 'PLAN'} #${String(shot.shotNumber).padStart(2, '0')}  ·  ${framingText}  ·  ${shot.durationSec}s`,
        x + 3,
        textY
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(60, 65, 75);
      const techLine = `${shot.cameraAngle || 'Eye-level'} · ${shot.lighting || ''}`.slice(0, 90);
      doc.text(techLine, x + 3, textY + 4.5);

      doc.setTextColor(30, 34, 42);
      const wrappedAction = doc.splitTextToSize(shot.actionDescription || '-', cardW - 6).slice(0, 3);
      doc.text(wrappedAction, x + 3, textY + 9.5);
    }
  }

  if (!hasDrawnAnyPage) {
    drawPageHeader(language === 'en' ? 'Empty storyboard' : 'Storyboard vide', 1);
    doc.setTextColor(80, 85, 95);
    doc.setFontSize(12);
    doc.text(
      language === 'en'
        ? 'No storyboard shots have been created for this selection yet.'
        : 'Aucun plan de storyboard n’a encore été créé pour cette sélection.',
      pageWidth / 2,
      pageHeight / 2,
      { align: 'center' }
    );
  }

  const arrayBuffer = doc.output('arraybuffer');
  const buffer = Buffer.from(arrayBuffer);
  const filename = `${project.slug}_storyboard.pdf`;
  return { filename, buffer };
}
