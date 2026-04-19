/**
 * Persist screening-answer adjudication results into apply_runs.answersJson.
 *
 * Runs inside a Temporal activity (full Node.js runtime) — workflow code
 * never imports this module.
 *
 * We intentionally do NOT reuse persistRunResult() from @dejsol/api: that
 * function performs a complete row update (outcome, state history, artifacts,
 * etc.) and is called at the end of the run from a different code path. This
 * helper only writes the `answers_json` column and is safe to call even if
 * the row has not yet received its final outcome — it is an additive write
 * of a single JSON blob.
 *
 * PrismaClient is resolved lazily so workflow code (which runs in the
 * Temporal sandbox and must not import @prisma/client) can still type-import
 * symbols from this file without pulling Prisma into the sandbox bundle.
 */

import type { ScreeningAnswerEntry } from "@dejsol/state-machine";

export interface PersistScreeningAnswersPayload {
  /** All screening answers for the run, post-adjudication. */
  screeningAnswers: ScreeningAnswerEntry[];
  /** Derived: true iff any entry needs human review or was rejected. */
  answerReviewRequired: boolean;
  /** Derived: count of entries with recommendation in {human_review_required, reject}. */
  answerReviewCount: number;
}

// Singleton so repeated activity invocations within the same worker process
// share one PrismaClient. Lazily constructed so tests / harness runs that do
// not have DATABASE_URL available can still import this module.
let cachedPrisma: unknown | null = null;

async function getPrisma(): Promise<{ applyRun: { update: (args: unknown) => Promise<unknown> } } | null> {
  if (cachedPrisma) {
    return cachedPrisma as { applyRun: { update: (args: unknown) => Promise<unknown> } };
  }
  if (!process.env["DATABASE_URL"]) {
    return null;
  }
  try {
    const mod = (await import("@prisma/client")) as { PrismaClient: new () => unknown };
    cachedPrisma = new mod.PrismaClient();
    return cachedPrisma as { applyRun: { update: (args: unknown) => Promise<unknown> } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[persist-screening-answers] Prisma unavailable: ${msg}`);
    return null;
  }
}

/**
 * Merge the adjudicated screeningAnswers + derived review metrics into
 * apply_runs.answers_json for the given runId.
 *
 * No-ops when:
 *   - DATABASE_URL is not set (dev / harness / tests)
 *   - @prisma/client cannot be loaded
 *   - the row does not exist yet (P2025) — swallowed, logged
 */
export async function persistScreeningAnswers(
  runId: string,
  payload: PersistScreeningAnswersPayload,
): Promise<void> {
  const prisma = await getPrisma();
  if (!prisma) return;

  const answersJson: Record<string, unknown> = {
    screeningAnswers: payload.screeningAnswers,
    answerReviewRequired: payload.answerReviewRequired,
    answerReviewCount: payload.answerReviewCount,
  };

  try {
    await prisma.applyRun.update({
      where: { id: runId },
      data: { answersJson: answersJson as unknown },
    } as unknown);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // P2025 = record not found. In normal production the apply_runs row is
    // created when the run is started, so this should be rare. Log and move
    // on — the workflow result is still correct.
    console.log(`[persist-screening-answers] update failed for run=${runId}: ${msg}`);
  }
}
