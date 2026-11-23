import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { logWarn } from './logger.ts';

export type SecretSource = 'env' | 'keychain' | 'local_file' | 'none';

export interface ResolvedCredential {
  apiKey: string | null;
  source: SecretSource;
  maskedPreview: string | null;
}

const KEYCHAIN_SERVICE = 'CineStudioAI';
const KEYCHAIN_ACCOUNT = 'gemini_api_key';
const FALLBACK_DIR = path.join(os.homedir(), '.cinestudio-ai');
const FALLBACK_FILE = path.join(FALLBACK_DIR, 'credentials.json');

function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}••••••${trimmed.slice(-4)}`;
}

/**
 * Resolves the Google Gemini API key strictly on the server side.
 * Priority:
 * 1. process.env.GEMINI_API_KEY (AI Studio Secrets & local .env)
 * 2. macOS Keychain (darwin only, using safe execFileSync without shell)
 * 3. Restricted local credentials file (~/.cinestudio-ai/credentials.json, chmod 0600)
 *
 * The raw key is NEVER sent to the browser, NEVER stored in localStorage,
 * and NEVER included in project ZIP exports.
 */
export function resolveGeminiCredential(): ResolvedCredential {
  const envKey = process.env.GEMINI_API_KEY?.trim();
  if (envKey && envKey !== 'MY_GEMINI_API_KEY') {
    return {
      apiKey: envKey,
      source: 'env',
      maskedPreview: maskKey(envKey),
    };
  }

  // macOS Keychain lookup when running natively on macOS
  if (process.platform === 'darwin') {
    try {
      const keychainValue = execFileSync(
        'security',
        ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT, '-w'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim();

      if (keychainValue) {
        return {
          apiKey: keychainValue,
          source: 'keychain',
          maskedPreview: maskKey(keychainValue),
        };
      }
    } catch {
      // Not stored in Keychain; fall through cleanly
    }
  }

  // Fallback: restricted local file outside any project directory
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      const stat = fs.statSync(FALLBACK_FILE);
      // Enforce strict owner-only permissions when on POSIX
      if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
        try {
          fs.chmodSync(FALLBACK_FILE, 0o600);
        } catch {
          logWarn('secretStore', 'Unable to tighten permissions on local credentials file');
        }
      }
      const raw = fs.readFileSync(FALLBACK_FILE, 'utf8');
      const parsed = JSON.parse(raw) as { geminiApiKey?: string };
      const fileKey = parsed.geminiApiKey?.trim();
      if (fileKey) {
        return {
          apiKey: fileKey,
          source: 'local_file',
          maskedPreview: maskKey(fileKey),
        };
      }
    }
  } catch (err) {
    logWarn('secretStore', 'Failed reading fallback credentials file', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    apiKey: null,
    source: 'none',
    maskedPreview: null,
  };
}
