/**
 * Extract file paths from text content.
 * Looks for patterns like `src/auth/refresh.ts`, `lib/utils.js`, etc.
 * Requires at least one directory separator and a file extension.
 */
export function extractFilePaths(text: string): string[] {
  const pattern = /(?:^|[\s`"'(,])([a-zA-Z0-9_.\-]+(?:\/[a-zA-Z0-9_.\-]+)+\.[a-zA-Z0-9]+)/gm;
  const matches = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    matches.add(match[1]);
  }
  return Array.from(matches);
}
