import type { ExceptionSeverity, Recommendation } from "@/lib/billcheck/types";

/**
 * Shared styling for the internal bill-checking screens.
 *
 * English only: these screens are for the accounts team and the CFO. The supplier-facing
 * screens stay bilingual, but withholding-tax terminology is easy to get wrong in a
 * second language, and a mistranslated deduction reads as authoritative.
 */

export const RECOMMENDATION_TEXT: Record<Recommendation, string> = {
  CLEAR: "Cleared",
  CLEAR_WITH_ADJUSTMENTS: "Cleared with adjustments",
  REVIEW_REQUIRED: "Needs review",
  BLOCKED: "Blocked",
};

export const RECOMMENDATION_TONE: Record<Recommendation, string> = {
  CLEAR: "bg-ok/10 text-ok",
  CLEAR_WITH_ADJUSTMENTS: "bg-warn/10 text-warn",
  REVIEW_REQUIRED: "bg-warn/10 text-warn",
  BLOCKED: "bg-destructive/10 text-destructive",
};

export const SEVERITY_TONE: Record<ExceptionSeverity, string> = {
  BLOCKER: "bg-destructive/10 text-destructive",
  REVIEW: "bg-warn/10 text-warn",
  INFO: "bg-info/10 text-info",
};
