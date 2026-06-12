import { getAppMode, AppMode } from './appMode';

export interface SystemStatus {
  appMode: AppMode;
  fufire: 'MOCK' | 'CONFIGURED' | 'LIVE_DISABLED' | 'ERROR' | 'LIVE';
  gelato: 'MOCK' | 'CONFIGURED' | 'LIVE_DISABLED' | 'ERROR' | 'LIVE';
  database: 'LOCAL MOCK' | 'SUPABASE STUB' | 'SUPABASE READY';
  security: 'SIMULATED RBAC' | 'RLS NOT ACTIVE' | 'RLS CONFIGURED';
  systemOperational: boolean;
  domainTarget: string;
  domainStatus: 'UNVERIFIED' | 'CONFIGURED' | 'LIVE' | 'ERROR';
}

export function getSystemStatus(): SystemStatus {
  const mode = getAppMode();
  
  // We cannot assume domain is LIVE synchronously.
  // App.tsx should perform the async check.
  const domainTarget = 'sizhu.fufire.space';
  const defaultDomainStatus = 'UNVERIFIED';

  if (mode === 'DEMO_LOCAL') {
    return {
      appMode: 'DEMO_LOCAL',
      fufire: 'MOCK',
      gelato: 'MOCK',
      database: 'LOCAL MOCK',
      security: 'SIMULATED RBAC',
      systemOperational: true,
      domainTarget,
      domainStatus: defaultDomainStatus
    };
  } else if (mode === 'SUPABASE_READY') {
    return {
      appMode: 'SUPABASE_READY',
      fufire: 'CONFIGURED',
      gelato: 'CONFIGURED',
      database: 'SUPABASE READY',
      security: 'RLS CONFIGURED',
      systemOperational: false,
      domainTarget,
      domainStatus: defaultDomainStatus
    };
  } else if (mode === 'PRODUCTION') {
    return {
      appMode: 'PRODUCTION',
      fufire: 'LIVE',
      gelato: 'LIVE',
      database: 'SUPABASE READY',
      security: 'RLS CONFIGURED',
      systemOperational: false,
      domainTarget,
      domainStatus: defaultDomainStatus
    };
  } else {
    return {
      appMode: 'CONFIG_REQUIRED',
      fufire: 'LIVE_DISABLED',
      gelato: 'LIVE_DISABLED',
      database: 'SUPABASE STUB',
      security: 'RLS NOT ACTIVE',
      systemOperational: false,
      domainTarget,
      domainStatus: defaultDomainStatus
    };
  }
}
