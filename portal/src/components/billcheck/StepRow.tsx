"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Loader2, Minus, X } from "lucide-react";
import type { ResolvedStep, StepState } from "@/lib/billcheck/steps";

/**
 * One check, and what it found.
 *
 * Shared by the progress screen and the result panel so the two can never drift: what a
 * supplier watches tick past is exactly what stays on the page afterwards.
 */
export function StepRow({
  step,
  index,
  state,
  compact = false,
}: {
  step: ResolvedStep;
  index: number;
  state: StepState;
  /** Tighter spacing for the persistent list under the result. */
  compact?: boolean;
}) {
  const active = state !== "pending";

  return (
    <motion.li
      initial={false}
      animate={{ opacity: active ? 1 : 0.45 }}
      transition={{ duration: 0.25 }}
      className={`flex items-start gap-3 ${compact ? "px-0 py-2" : "px-6 py-3"} ${
        state === "skipped" ? "opacity-70" : ""
      }`}
    >
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
        <StepIcon state={state} index={index} />
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={`text-sm ${
            state === "skipped"
              ? "text-muted-foreground line-through decoration-muted-foreground/40"
              : active
                ? "font-medium text-foreground"
                : "text-muted-foreground"
          }`}
        >
          {step.title}
        </p>

        <AnimatePresence>
          {state !== "pending" && state !== "running" && step.detail && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-0.5 text-xs text-muted-foreground"
            >
              {step.detail}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Anything flagged is named here rather than hidden behind a colour. */}
        {(state === "warn" || state === "blocked") &&
          step.findings.slice(0, 2).map((finding, i) => (
            <p
              key={i}
              className={`mt-1 text-xs ${state === "blocked" ? "text-destructive" : "text-warn"}`}
            >
              {finding.message}
            </p>
          ))}
      </div>
    </motion.li>
  );
}

export function StepIcon({ state, index }: { state: StepState; index: number }) {
  const pop = {
    initial: { scale: 0.4, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    transition: { type: "spring" as const, stiffness: 500, damping: 18 },
  };

  switch (state) {
    case "running":
      return <Loader2 className="size-4 animate-spin text-primary" />;
    case "ok":
      return (
        <motion.span
          {...pop}
          className="flex size-5 items-center justify-center rounded-full bg-ok/15"
        >
          <Check className="size-3.5 text-ok" strokeWidth={3} />
        </motion.span>
      );
    case "warn":
      return (
        <motion.span
          {...pop}
          className="flex size-5 items-center justify-center rounded-full bg-warn/15"
        >
          <AlertTriangle className="size-3 text-warn" strokeWidth={3} />
        </motion.span>
      );
    case "blocked":
      return (
        <motion.span
          {...pop}
          className="flex size-5 items-center justify-center rounded-full bg-destructive/15"
        >
          <X className="size-3.5 text-destructive" strokeWidth={3} />
        </motion.span>
      );
    case "skipped":
      return (
        <span className="flex size-5 items-center justify-center rounded-full bg-muted">
          <Minus className="size-3 text-muted-foreground" strokeWidth={3} />
          <span className="sr-only">Not reached</span>
        </span>
      );
    default:
      return (
        <span className="flex size-5 items-center justify-center">
          <span className="size-2 rounded-full border-2 border-muted-foreground/40" />
          <span className="sr-only">Step {index + 1} not started</span>
        </span>
      );
  }
}
