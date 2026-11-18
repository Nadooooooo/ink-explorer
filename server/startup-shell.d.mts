export const startupCopy: Record<string, [string, string, string, string]>;
export function startupShell(language?: string, initialContent?: string): string;
export function replaceStartupShell(html: string, language?: string, initialContent?: string, options?: { notFound?: boolean; basePath?: string }): string;
