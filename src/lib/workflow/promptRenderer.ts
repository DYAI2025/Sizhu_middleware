/**
 * Bazzi Middleware Platform - Prompt Template Compile Engine
 */

/**
 * Robust nested path resolver.
 * e.g., getPropertyByPath({ a: { b: 2 } }, "a.b") == 2
 */
export function getPropertyByPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => {
    if (acc === null || acc === undefined) return undefined;
    if (typeof acc === 'object' && part in acc) {
      return acc[part];
    }
    return undefined;
  }, obj);
}

/**
 * Compiles a Markdown prompt template, replacing dynamic coordinates.
 * Returns a controlled error if any variable parsed inside {{ }} is missing.
 */
export function renderPrompt(templateContent: string, payload: any): string {
  const matches = templateContent.match(/{{[\s\w.]+}}/g) || [];
  let evaluated = templateContent;
  
  for (const match of matches) {
    const cleanPath = match.replace(/[{}]/g, '').trim();
    const val = getPropertyByPath(payload, cleanPath);
    if (val === undefined) {
      throw new Error(`Controlled compilation error: Required template variable "${cleanPath}" is missing or undefined.`);
    }
    evaluated = evaluated.replace(match, String(val));
  }
  return evaluated;
}
