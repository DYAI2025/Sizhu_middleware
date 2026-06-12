import { AppRoleName, RolePermissions } from '../../types';

export const ALL_PERMISSIONS = [
  { id: 'view_dashboard', name: 'View Dashboard', description: 'Access dashboard metrics and activity pipelines' },
  { id: 'manage_products', name: 'Manage Products', description: 'Create, edit, and bind templates to shop products' },
  { id: 'manage_templates', name: 'Manage Templates', description: 'Upload, modify, and version Markdown prompts' },
  { id: 'manage_credentials', name: 'Manage Credentials', description: 'View and change secret references for APIs' },
  { id: 'run_simulation', name: 'Run Simulator', description: 'Initiate simulated order workflow pipeline runs' },
  { id: 'manage_roles', name: 'Modify Roles & Permissions', description: 'Adjust permission mappings for other team members' }
] as const;

export const DEFAULT_ROLE_PERMISSIONS: RolePermissions[] = [
  { role: 'Owner', permissions: ['view_dashboard', 'manage_products', 'manage_templates', 'manage_credentials', 'run_simulation', 'manage_roles'] },
  { role: 'Admin', permissions: ['view_dashboard', 'manage_products', 'manage_templates', 'manage_credentials', 'run_simulation'] },
  { role: 'Observer', permissions: ['view_dashboard'] },
  { role: 'Custom', permissions: ['view_dashboard', 'run_simulation'] }
];

/**
 * Checks if a role is permitted to perform an operation.
 */
export function hasPermission(role: AppRoleName, permissionId: string): boolean {
  const mapping = DEFAULT_ROLE_PERMISSIONS.find(rp => rp.role === role);
  return mapping ? mapping.permissions.includes(permissionId) : false;
}

/**
 * Enforces that an Observer or unauthorized role cannot mutate configurations or trigger writes.
 * The config is frozen or unmodified if permissions fail, ensuring immutability under observation.
 */
export function secureMutateConfig<T extends object>(
  role: AppRoleName,
  neededPermission: string,
  config: T,
  mutation: (cfg: T) => void
): T {
  if (!hasPermission(role, neededPermission)) {
    throw new Error(`Unauthorized mutation: Role "${role}" lacks the "${neededPermission}" permission required to update settings.`);
  }
  // Standard deep copy to maintain isolation
  const cloned = JSON.parse(JSON.stringify(config)) as T;
  mutation(cloned);
  return cloned;
}
