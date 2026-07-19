"use client";

import { useRef, type ChangeEvent, type KeyboardEvent, type ClipboardEvent } from "react";
import { cn } from "@/lib/utils";

export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  autoFocus,
  invalid,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  length?: number;
  autoFocus?: boolean;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const chars = Array.from({ length }, (_, i) => value[i] ?? "");

  const commit = (next: string) => {
    const v = next.slice(0, length);
    onChange(v);
    if (v.length === length) onComplete?.(v);
    return v;
  };

  const handleChange = (i: number, e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (!raw) {
      commit(chars.map((c, idx) => (idx === i ? "" : c)).join(""));
      return;
    }
    if (raw.length > 1) {
      const v = commit((value.slice(0, i) + raw).slice(0, length));
      refs.current[Math.min(length - 1, i + raw.length)]?.focus();
      void v;
      return;
    }
    const arr = chars.slice();
    arr[i] = raw;
    commit(arr.join(""));
    if (i < length - 1) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (chars[i]) {
        commit(chars.map((c, idx) => (idx === i ? "" : c)).join(""));
      } else if (i > 0) {
        refs.current[i - 1]?.focus();
        commit(chars.map((c, idx) => (idx === i - 1 ? "" : c)).join(""));
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < length - 1) {
      refs.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const raw = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!raw) return;
    commit(raw);
    refs.current[Math.min(length - 1, raw.length)]?.focus();
  };

  return (
    <div className="flex gap-2" onPaste={handlePaste}>
      {chars.map((c, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          value={c}
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          aria-label={`Digit ${i + 1}`}
          className={cn(
            "h-12 w-11 rounded-xl border bg-muted/40 text-center text-lg font-bold text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/50 disabled:opacity-50",
            invalid ? "border-danger ring-2 ring-danger/25" : "border-border",
          )}
        />
      ))}
    </div>
  );
}
