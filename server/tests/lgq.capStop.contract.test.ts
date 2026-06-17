import { describe, it, expect, beforeEach } from 'vitest';
import { runWorkflow } from '../services/workflowRunService';
import {
  LocalSettingsRepository,
  LocalWorkflowRepository,
} from '../../src/lib/repositories/localRepository';
import { COST_CAP_REACHED } from '../../src/lib/workflow/costCap';

/**
 * CONTRACT — REQ-LGQ-004 / OQ-2, the cost-cap ESCALATION mapping end-to-end.
 *
 * The bare enforcer (lgq.costCap) and the decorator seam (lgq.costCapWiring) are
 * proven elsewhere. This file proves the part code review B1 flagged as untested:
 * when a cap bite happens INSIDE the run, the run is persisted as escalated with the
 * distinct COST_CAP_REACHED reason — owned by the runner (which holds runId+state),
 * NOT re-discovered by a racy out-of-band orderNumber/status heuristic.
 *
 * Drives the mock path (VITEST=true) with a tiny configured cap so the first
 * 3-candidate batch trips the count cap.
 */
describe('REQ-LGQ-004 — a cost-cap bite escalates the run with COST_CAP_REACHED, persisted', () => {
  beforeEach(() => {
    process.env.VITEST = 'true';
  });

  it('maxImagesPerRun=1 → capStopped, status escalated, reason persisted on the run record', async () => {
    const settings = new LocalSettingsRepository();
    const configs = await settings.getGenConfigs();
    // Force a tiny cap on the test product so the first batch (numInitiallyGenerated)
    // exceeds it and the runner's CostCapError catch fires.
    await settings.saveGenConfigs(
      configs.map((c) => (c.productId === 'prod-001' ? { ...c, maxImagesPerRun: 1 } : c)),
    );

    const result = await runWorkflow({
      orderNumber: 'ORD-CAP-1',
      productId: 'prod-001',
      customerName: 'Test User',
      birthDate: '1991-07-23',
      birthTime: '14:00',
      birthTimeKnown: true,
      birthPlace: 'London',
    });

    expect(result.capStopped).toBe(true);
    expect(result.status).toBe('escalated');
    expect(result.escalationReason).toBe(COST_CAP_REACHED);

    // Persisted on the run RECORD (not only the returned object) — OQ-2.
    const runs = await new LocalWorkflowRepository().getWorkflowRuns();
    const persisted = runs.find((r) => r.id === result.id);
    expect(persisted?.status).toBe('escalated');
    expect(persisted?.escalationReason).toBe(COST_CAP_REACHED);
    // Mutation RED: revert the runner's CostCapError catch (let it propagate) or drop
    // the escalationReason persist → status stays 'running' / reason undefined.
  });
});
