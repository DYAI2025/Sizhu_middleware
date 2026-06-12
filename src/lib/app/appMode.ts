export type AppMode = 'MOCK_LOCAL' | 'SUPABASE_STUB' | 'SUPABASE_DISABLED' | 'PRODUCTION_NOT_READY';

export function getAppMode(): AppMode {
  // Use import.meta.env or fallback to window/process
  const mode = (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_APP_MODE) || 'MOCK_LOCAL';
  if (mode === 'SUPABASE_STUB') return 'SUPABASE_STUB';
  if (mode === 'SUPABASE_DISABLED') return 'SUPABASE_DISABLED';
  if (mode === 'PRODUCTION_NOT_READY') return 'PRODUCTION_NOT_READY';
  return 'MOCK_LOCAL';
}
