import { AlertTriangle } from 'lucide-react';
import { AppMode } from '../lib/app/appMode';

interface PersistenceOfflineBannerProps {
  /** The resolved app mode (e.g. CONFIG_REQUIRED). */
  mode: AppMode;
  /** Human, actionable reason rendered to the operator. */
  reason: string;
}

/**
 * Presentational banner surfacing the fail-closed persistence boundary.
 *
 * Rendered when the persistence layer throws SUPABASE_NOT_CONFIGURED (any
 * non-DEMO_LOCAL mode). It replaces the previous silent "dead simulator" — empty
 * catalog + disabled button + no reason — with a mode-aware, actionable message.
 *
 * Styled to match the existing status callouts in WorkflowRunsView (the
 * fail-closed `border-ac` / `text-ac` / `font-mono` system). Reused across views.
 */
export default function PersistenceOfflineBanner({ mode, reason }: PersistenceOfflineBannerProps) {
  return (
    <div
      role="alert"
      id="persistence-offline-banner"
      data-mode={mode}
      className="bg-b1 border border-ac rounded-sm p-3.5 text-[11px] text-ac leading-relaxed font-mono flex items-start gap-2.5"
    >
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <div>
        <div className="font-bold uppercase tracking-wider text-[10px]">
          Persistenz offline · Modus {mode}
        </div>
        <p className="mt-1 normal-case font-normal text-nt">{reason}</p>
      </div>
    </div>
  );
}
