import assert from 'assert';
import fs from 'fs';
import JSZip from 'jszip';
import os from 'os';
import path from 'path';
import { getSettings, initDatabase, saveSettings, syncProjectDiskSnapshot } from '../server/db/database.ts';
import { geminiImageProvider } from '../server/providers/geminiProvider.ts';
import {
  ensureProjectDirectoryStructure,
  resolveConfinedPath,
  saveProjectImageFile,
} from '../server/services/storage.ts';

async function runTests() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cinestudio-test-'));
  const dbPath = path.join(tmpDir, 'test.sqlite');
  const projectsRoot = path.join(tmpDir, 'CineStudioProjects');

  try {
    console.log('1. Test persistance SQLite (ouverture / fermeture / réouverture)...');
    const db1 = initDatabase(dbPath);
    const settings = getSettings(db1);
    saveSettings({ ...settings, projectsRoot }, db1);

    const projectId = 'proj-test-001';
    const folderPath = ensureProjectDirectoryStructure(projectsRoot, 'projet_test');
    const now = new Date().toISOString();

    db1
      .prepare(
        `INSERT INTO projects (id, slug, title, logline, folder_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(projectId, 'projet_test', 'Film Test', 'Un réalisateur prépare son film.', folderPath, now, now);

    syncProjectDiskSnapshot(projectId, db1);
    db1.close();

    // Reopen fresh SQLite connection to confirm durability
    const db2 = initDatabase(dbPath);
    const reloaded = db2.prepare('SELECT title FROM projects WHERE id = ?').get(projectId) as
      | { title: string }
      | undefined;
    assert.strictEqual(reloaded?.title, 'Film Test', 'Le projet doit persister après réouverture');
    assert.ok(
      fs.existsSync(path.join(folderPath, 'project.json')),
      'Le snapshot project.json doit exister sur disque'
    );
    db2.close();
    console.log('   OK');

    console.log('2. Test confinement des chemins (anti path-traversal)...');
    let blocked = false;
    try {
      resolveConfinedPath(folderPath, '../../etc/passwd');
    } catch {
      blocked = true;
    }
    assert.strictEqual(blocked, true, 'La traversée de répertoire doit être bloquée');
    console.log('   OK');

    console.log('3. Test organisation locale des fichiers images...');
    const saved = saveProjectImageFile({
      projectDir: folderPath,
      entityType: 'character_portrait',
      characterSlug: 'claire_01',
      filename: 'portrait.png',
      buffer: Buffer.from([137, 80, 78, 71]),
    });
    assert.ok(
      saved.relativePath.includes('characters/claire_01/references/portrait.png'),
      'Les références personnages doivent être rangées dans characters/<slug>/references/'
    );
    console.log('   OK');

    console.log('4. Test estimation des coûts avant génération...');
    const estimate = geminiImageProvider.estimateCost({
      modelId: 'gemini-nano-banana-2.1',
      resolution: '2K',
      aspectRatio: '4:5',
      variantCount: 4,
      settings: { ...settings, currency: 'EUR', eurExchangeRate: 0.92 },
    });
    assert.strictEqual(estimate.variantCount, 4);
    assert.strictEqual(estimate.effectiveApiAspectRatio, '3:4');
    assert.ok(estimate.totalCostUsd > 0, 'Le coût estimé doit être positif');
    assert.ok(estimate.aspectRatioNote, 'Le mapping 4:5 -> 3:4 doit être expliqué clairement');
    console.log('   OK');

    console.log('5. Test archive ZIP propre sans clé API...');
    const zip = new JSZip();
    zip.file('project.json', fs.readFileSync(path.join(folderPath, 'project.json')));
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    assert.ok(buf.length > 0);
    const textDump = buf.toString('utf8');
    assert.ok(!textDump.includes('AIza'), 'Aucune clé API ne doit figurer dans le ZIP');
    console.log('   OK');

    console.log('\nTous les tests smoke CineStudio AI ont réussi !');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('Échec des tests smoke :', err);
  process.exit(1);
});
