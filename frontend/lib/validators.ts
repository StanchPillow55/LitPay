export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateUploadFile(file: File): ValidationResult {
  const errors: string[] = [];

  // Check file type
  const allowedTypes = ['application/pdf', 'text/markdown', 'text/plain'];
  const allowedExtensions = ['.pdf', '.md'];

  const hasValidType = allowedTypes.includes(file.type);
  const hasValidExt = allowedExtensions.some((ext) =>
    file.name.toLowerCase().endsWith(ext)
  );

  if (!hasValidType && !hasValidExt) {
    errors.push('File must be PDF or Markdown (.pdf or .md)');
  }

  // Check file size (20MB max)
  const maxSize = 20 * 1024 * 1024; // 20,971,520 bytes
  if (file.size > maxSize) {
    errors.push(`File size (${formatBytes(file.size)}) exceeds 20MB limit`);
  }

  // Check file name
  if (file.name.length > 255) {
    errors.push('File name is too long (max 255 characters)');
  }

  if (file.size === 0) {
    errors.push('File is empty');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
