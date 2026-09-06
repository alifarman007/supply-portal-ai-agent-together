"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveSteps } from "@/lib/billcheck/steps";
import { StepRow } from "./StepRow";
import type { ReviewDetail } from "@/lib/billcheck/types";

/**
 * What the checker is doing, while it does it.
 *
 * Each row is a real step of the pipeline showing what it really found — which quantities
 * were cut back to the goods receipt, which VAT rate applied, which TDS serial the product
 * falls under. None of it is decorative.
 *
 * The reveal is PACED, not simulated. The deterministic check finishes in about 90 ms, so
 * without pacing all eight results would appear in a single frame and nobody could read
 * them. Rows therefore appear at reading speed while the real answer, already in hand,
 * fills them in — and the true elapsed time is printed at the bottom rather than the
 * animation's duration. If the AI nodes are switched on the wait is genuinely 15-45
 * seconds, and the last row holds on its spinner until the answer actually lands.
 */

/** How long each row waits before revealing. Fast enough not to annoy, slow enough to read. */
const REVEAL_MS = 460;

export interface CheckOutcome {
  recommendation: "CLEAR" | "CLEAR_WITH_ADJUSTMENTS" | "REVIEW_REQUIRED" | "BLOCKED";
  net_payable_tk: string | null;
  detail: ReviewDetail | null;
  elapsedMs?: number;
}

interface Props {
  open: boolean;
  poNumber: string;
  /** null while the request is still in flight. */
  outcome: CheckOutcome | null;
  /** Set when the submission failed outright; the screen shows the reason and stops. */
  failure: string | null;
  onClose: () => void;
}

const OUTCOME_TEXT: Record<CheckOutcome["recommendation"], string> = {
  CLEAR: "Cleared",
  CLEAR_WITH_ADJUSTMENTS: "Cleared with adjustments",
  REVIEW_REQUIRED: "Sent for review",
  BLOCKED: "Blocked",
};

const OUTCOME_TONE: Record<CheckOutcome["recommendation"], string> = {
  CLEAR: "text-ok",
  CLEAR_WITH_ADJUSTMENTS: "text-warn",
  REVIEW_REQUIRED: "text-warn",
  BLOCKED: "text-destructive",
};

export function CheckProgress({ open, poNumber, outcome, failure, onClose }: Props) {
  const [revealed, setRevealed] = useState(0);

  const steps = resolveSteps(outcome?.detail ?? null, poNumber);
  const total = steps.length;
  const hasOutcome = outcome !== null;
  const finished = revealed >= total && hasOutcome;

  // No reset effect: the parent gives this component a fresh `key` per submission, so a
  // new check remounts it at zero. Resetting state from an effect would cost a cascading
  // render for no benefit.
  useEffect(() => {
    if (!open || failure) return;
    const id = setInterval(() => {
      setRevealed((current) => {
        // The final row cannot tick until the real answer is in. With the deterministic
        // check that is already true before the first row appears; with the AI nodes on,
        // this is where the screen genuinely waits.
        const ceiling = hasOutcome ? total : total - 1;
        return Math.min(current + 1, ceiling);
      });
    }, REVEAL_MS);
    return () => clearInterval(id);
    // `hasOutcome` rather than `outcome`: the interval only needs to know WHETHER the
    // answer has landed, so it is rebuilt once, not on every field of the payload.
  }, [open, failure, total, hasOutcome]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
        role="status"
        aria-live="polite"
        aria-label="Checking your bill"
      >
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        >
          <header className="border-b border-border px-6 py-5">
            <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {failure ? "Could not check this bill" : finished ? "Check complete" : "Checking your bill"}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">{poNumber}</h2>
            {!failure && (
              <p className="mt-1 text-sm text-muted-foreground">
                Against the purchase order, the goods receipt and the FY2026-27 NBR rules.
              </p>
            )}
          </header>

          {failure ? (
            <div className="px-6 py-6">
              <div className="flex items-start gap-2.5 rounded-xl bg-destructive/10 p-3.5 text-sm text-destructive">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p>{failure}</p>
                  <p className="mt-1 opacity-80">Nothing has been saved.</p>
                </div>
              </div>
              <Button variant="outline" className="mt-5 w-full" onClick={onClose}>
                Close
              </Button>
            </div>
          ) : (
            <>
              <ol className="divide-y divide-border">
                {steps.map((step, index) => (
                  <StepRow
                    key={step.key}
                    step={step}
                    index={index}
                    state={
                      index < revealed
                        ? step.state
                        : index === revealed
                          ? "running"
                          : "pending"
                    }
                  />
                ))}
              </ol>

              <footer className="border-t border-border px-6 py-4">
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (revealed / total) * 100)}%` }}
                    transition={{ ease: "easeOut", duration: 0.3 }}
                  />
                </div>

                <AnimatePresence>
                  {finished && outcome && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <span
                          className={`text-base font-semibold ${OUTCOME_TONE[outcome.recommendation]}`}
                        >
                          {OUTCOME_TEXT[outcome.recommendation]}
                        </span>
                        {outcome.net_payable_tk && (
                          <span className="text-sm text-muted-foreground">
                            Net payable{" "}
                            <span className="tnum font-semibold text-foreground">
                              {Number(outcome.net_payable_tk).toLocaleString("en-BD", {
                                minimumFractionDigits: 2,
                              })}{" "}
                              Tk
                            </span>
                          </span>
                        )}
                      </div>
                      {/* The real number, not the animation's length. */}
                      {outcome.elapsedMs !== undefined && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Checked in {(outcome.elapsedMs / 1000).toFixed(2)}s.
                        </p>
                      )}
                      <Button className="mt-4 w-full" onClick={onClose}>
                        See the full result
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </footer>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
