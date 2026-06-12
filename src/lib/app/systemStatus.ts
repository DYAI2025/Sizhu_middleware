import { getAppMode, AppMode } from './appMode';

export interface SystemStatus {
  appMode: AppMode;
  fufire: 'MOCK' | 'CONFIGURED' | 'LIVE_DISABLED' | 'ERROR' | 'LIVE';
  gelato: 'MOCK' | 'CONFIGURED' | 'LIVE_DISABLED' | 'ERROR' | 'LIVE';
  database: 'LOCAL MOCK' | 'SUPABASE STUB' | 'SUPABASE READY';
  security: 'SIMULATED RBAC' | 'RLS NOT ACTIVE' | 'RLS CONFIGURED';
  systemOperational: boolean;
}

export function getSystemStatus(): SystemStatus {
  const mode = getAppMode();
  
  if (mode === 'MOCK_LOCAL') {
    return {
      appMode: 'MOCK_LOCAL',
      fufire: 'MOCK',
      gelato: 'MOCK',
      database: 'LOCAL MOCK',
      security: 'SIMULATED RBAC',
      systemOperational: true
    };
  } else if (mode === 'SUPABASE_STUB') {
    return {
      appMode: 'SUPABASE_STUB',
      fufire: 'LIVE_DISABLED',
      gelato: 'LIVE_DISABLED',
      database: 'SUPABASE STUB',
      security: 'RLS NOT ACTIVE',
      systemOperational: false
    };
  } else if (mode === 'SUPABASE_DISABLED') {
    return {
      appMode: 'SUPABASE_DISABLED',
      fufire: 'LIVE_DISABLED',
      gelato: 'LIVE_DISABLED',
      database: 'SUPABASE STUB',
      security: 'RLS NOT ACTIVE',
      systemOperational: false
    };
  } else {
    return {
      appMode: 'PRODUCTION_NOT_READY',
      fufire: 'ERROR',
      gelato: 'ERROR',
      database: 'SUPABASE STUB',
      security: 'RLS NOT ACTIVE',
      systemOperational: false
    };
  }
}
