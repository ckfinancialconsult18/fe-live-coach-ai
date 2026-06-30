export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB — matches the `documents` storage bucket limit set in Phase 1

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const;

export const DOCUMENT_CATEGORIES = ['application', 'policy', 'id', 'medical', 'beneficiary', 'other'] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export function isAllowedMimeType(mime: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}
