import mammoth from 'mammoth';
import path from 'path';
import { extractText } from 'unpdf';

export interface ParsedScreenplayUpload {
  text: string;
  format: 'txt' | 'docx' | 'pdf';
}

export async function parseScreenplayBuffer(
  filename: string,
  buffer: Buffer
): Promise<ParsedScreenplayUpload> {
  const ext = path.extname(filename).toLowerCase();

  if (ext === '.txt' || ext === '.fountain' || ext === '.md') {
    return {
      text: buffer.toString('utf8'),
      format: 'txt',
    };
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value.trim(),
      format: 'docx',
    };
  }

  if (ext === '.pdf') {
    const uint8 = new Uint8Array(buffer);
    const extracted = await extractText(uint8, { mergePages: true });
    const text = Array.isArray(extracted.text) ? extracted.text.join('\n\n') : String(extracted.text || '');
    return {
      text: text.trim(),
      format: 'pdf',
    };
  }

  throw new Error('Format de scénario non pris en charge. Utilisez .PDF, .DOCX ou .TXT.');
}
