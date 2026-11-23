import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { getDb } from './server/db/database.ts';
import { createApiRouter } from './server/routes/api.ts';
import { logInfo } from './server/services/logger.ts';

async function startServer() {
  // Initialize SQLite database & default cinema prompt templates
  getDb();

  const app = express();
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Local security headers (compatible with AI Studio iframe preview)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Mount REST API
  app.use('/api', createApiRouter());

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (isProd && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT || 3000);
  // On macOS local launch script, HOST=127.0.0.1 is set explicitly;
  // in container/AI Studio preview, binds 0.0.0.0:3000 by default.
  const HOST = process.env.HOST || '0.0.0.0';

  app.listen(PORT, HOST, () => {
    logInfo('server', `CineStudio AI listening on http://${HOST}:${PORT}`, {
      mode: isProd ? 'production' : 'development',
    });
    console.log(`CineStudio AI prêt sur http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Impossible de démarrer CineStudio AI :', err);
  process.exit(1);
});
