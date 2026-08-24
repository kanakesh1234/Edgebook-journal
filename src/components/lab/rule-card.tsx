"use client";

import { motion } from "motion/react";
import type { RuleDef } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AlertTriangleIcon } from "@/components/ui/icons";
import { EASE } from "@/components/landing/reveal";

/**
 * RuleCard — one rule of the trader's operating manual.
 * Toggle + parameters, autosaved on change.
 */
export function RuleCard({
  rule,
  violations30,
  onChange,
  delay = 0,
}: {
  rule: RuleDef;
  violations30: number;
  onChange: (patch: Partial<RuleDef>) => void;
  delay?: number;
}) {
  const numberParams = Object.entries(rule.params).filter(([, v]) => typeof v === "number") as [string, number][];
  const listParams = Object.entries(rule.params).filter(([, v]) => Array.isArray(v)) as [string, string[]][];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: EASE }}
      className={cn(
        "rounded-control border p-4 transition-colors",
        rule.enabled ? "border-line bg-raised/60" : "border-line-soft bg-transparent opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("text-sm font-semibold", rule.enabled ? "text-ink" : "text-muted")}>{rule.label}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{rule.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {rule.enabled && violations30 > 0 && (
            <span
              className="flex items-center gap-1 rounded-full border border-loss/25 bg-loss/[0.08] px-2 py-0.5 text-[10px] font-semibold text-loss"
              title={`${violations30} violations in the last 30 days`}
            >
              <AlertTriangleIcon className="h-3 w-3" />
              {violations30}
            </span>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={rule.enabled}
            aria-label={`${rule.label} — ${rule.enabled ? "enabled" : "disabled"}`}
            onClick={() => onChange({ enabled: !rule.enabled })}
            className={cn(
              "relative h-5.5 w-9 shrink-0 rounded-full border transition-colors duration-200",
              rule.enabled ? "border-gold/50 bg-gold/25" : "border-line-strong bg-canvas",
            )}
          >
            <span
              className={cn(
                "absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-all duration-200",
                rule.enabled ? "left-[18px] bg-gold-strong" : "left-[3px] bg-line-strong",
              )}
            />
          </button>
        </div>
      </div>

      {rule.enabled && (numberParams.length > 0 || listParams.length > 0) && (
        <div className="mt-3.5 space-y-3 border-t border-line-soft pt-3.5">
          {numberParams.map(([key, value]) => (
            <label key={key} className="flex items-center justify-between gap-3 text-[13px] text-muted">
              <span className="capitalize-first">
                {key === "limit" ? "Daily loss limit ($)" : key === "maxTrades" ? "Max trades" : key === "max" ? "Max consecutive losses" : key === "min" ? "Minimum R multiple" : key}
              </span>
              <input
                type="number"
                min={1}
                value={value}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) onChange({ params: { ...rule.params, [key]: n } });
                }}
                className="num w-24 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-right text-ink transition-colors hover:border-line-strong focus:border-gold/60 focus:outline-none focus:ring-4 focus:ring-gold/10"
                aria-label={`${rule.label} — ${key}`}
              />
            </label>
          ))}
          {listParams.map(([key, values]) => (
            <TagInput
              key={key}
              label={key === "instruments" ? "Symbols (e.g. NQ, ES, BTCUSD)" : "Setups from your playbook"}
              values={values}
              placeholder={key === "instruments" ? "Add symbol…" : "Add setup…"}
              onChange={(next) => onChange({ params: { ...rule.params, [key]: next } })}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function TagInput({
  label,
  values,
  placeholder,
  onChange,
}: {
  label: string;
  values: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
}) {
  return (
    <div>
      <p className="text-[13px] text-muted">{label}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink"
          >
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="text-faint transition-colors hover:text-loss"
            >
              ×
            </button>
          </span>
        ))}
        <input
          aria-label={label}
          placeholder={placeholder}
          className="w-28 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-xs text-ink placeholder:text-faint focus:border-gold/60 focus:bg-surface focus:outline-none"
          onKeyDown={(e) => {
            const el = e.currentTarget;
            if ((e.key === "Enter" || e.key === ",") && el.value.trim()) {
              e.preventDefault();
              const v = el.value.trim();
              if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
              el.value = "";
            } else if (e.key === "Backspace" && !el.value && values.length > 0) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={(e) => {
            if (e.target.value.trim()) {
              const v = e.target.value.trim();
              if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
              e.target.value = "";
            }
          }}
        />
      </div>
    </div>
  );
}
