import type { CSSProperties } from "react";

export const tooltipStyle: CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  color: "var(--foreground)",
  fontSize: 12,
  boxShadow: "var(--shadow)",
  padding: "8px 12px",
};

export const tooltipItemStyle: CSSProperties = { color: "var(--foreground)" };

export const tooltipLabelStyle: CSSProperties = {
  color: "var(--muted-foreground)",
  marginBottom: 4,
  fontWeight: 600,
};
