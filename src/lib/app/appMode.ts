export type AppMode = 'DEMO_LOCAL' | 'CONFIG_REQUIRED' | 'SUPABASE_READY' | 'PRODUCTION';

export function getAppMode(): AppMode {
  // Use import.meta.env or fallback to window.process
  let modeStr = (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_APP_MODE) || '';
  if (!modeStr && typeof process !== 'undefined') {
    modeStr = process.env.APP_MODE || '';
  }
  
  if (modeStr === 'MOCK_LOCAL' || modeStr === 'DEMO_LOCAL') return 'DEMO_LOCAL';
  if (modeStr === 'PRODUCTION') return 'PRODUCTION';
  if (modeStr === 'SUPABASE_READY') return 'SUPABASE_READY';
  if (modeStr === 'PRODUCTION_NOT_READY' || modeStr === 'CONFIG_REQUIRED') return 'CONFIG_REQUIRED';
  if (modeStr === 'SUPABASE_STUB' || modeStr === 'SUPABASE_DISABLED') return 'CONFIG_REQUIRED'; // Mapping old modes
  
  return 'DEMO_LOCAL'; // Default to DEMO_LOCAL
}
