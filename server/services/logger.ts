import fs from 'fs';
import path from 'path';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'cinestudio.log');

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function sanitizeMessage(msg: string): string {
  // Never leak Google API keys or bearer tokens into logs
  return msg
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_API_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
}

export function logInfo(scope: string, message: string, meta?: Record<string, unknown>): void {
  writeEntry('INFO', scope, message, meta);
}

export function logWarn(scope: string, message: string, meta?: Record<string, unknown>): void {
  writeEntry('WARN', scope, message, meta);
}

export function logError(scope: string, message: string, meta?: Record<string, unknown>): void {
  writeEntry('ERROR', scope, message, meta);
}

function writeEntry(
  level: 'INFO' | 'WARN' | 'ERROR',
  scope: string,
  message: string,
  meta?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  const safeMsg = sanitizeMessage(message);
  const safeMeta = meta ? ` ${sanitizeMessage(JSON.stringify(meta))}` : '';
  const line = `[${timestamp}] [${level}] [${scope}] ${safeMsg}${safeMeta}\n`;

  try {
    ensureLogDir();
    fs.appendFileSync(LOG_FILE, line, { encoding: 'utf8' });
  } catch {
    // Fallback to stderr if log file cannot be written
  }

  if (level === 'ERROR') {
    console.error(line.trimEnd());
  } else if (level === 'WARN') {
    console.warn(line.trimEnd());
  }
}
