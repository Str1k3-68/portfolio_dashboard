"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { EnsembleSummary } from "@/lib/api";

interface Props {
  ensembles: EnsembleSummary[];
  onFilterChange?: (letter: string | null) => void;
  activeFilter?: string | null;
}

function fmtPct(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function colorVal(v: number): string {
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-muted-foreground";
}

export function EnsembleSummaryCards({ ensembles, onFilterChange, activeFilter }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!ensembles.length) return null;

  return (
    <div data-testid="section-ensembles" className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Alt Ensembles
        </h3>
        {activeFilter && (
          <button
            onClick={() => onFilterChange?.(null)}
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer px-2 py-1 rounded hover:bg-muted transition-colors"
          >
            Clear filter
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {ensembles.map((ens) => {
          const isActive = activeFilter === ens.letter;
          const isExpanded = expanded === ens.letter;

          return (
            <div key={ens.letter} className="flex flex-col gap-1">
              {/* Main card */}
              <button
                onClick={() => {
                  onFilterChange?.(isActive ? null : ens.letter);
                }}
                className={`rounded-lg border p-3 text-left transition-all cursor-pointer ${
                  isActive
                    ? "border-border bg-muted/60 ring-1"
                    : "border-border/50 hover:border-border hover:bg-muted/30"
                }`}
                style={isActive ? { "--tw-ring-color": ens.color, borderColor: ens.color } as React.CSSProperties : {}}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: `${ens.color}20`,
                      color: ens.color,
                    }}
                  >
                    {ens.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {ens.component_count} symph
                  </span>
                </div>
                <div className={`text-lg font-bold tabular-nums ${colorVal(ens.weighted_today_return)}`}>
                  {fmtPct(ens.weighted_today_return)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  TWR {fmtPct(ens.weighted_twr)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  ${ens.total_aum.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </button>

              {/* Expand toggle */}
              <button
                onClick={() => setExpanded(isExpanded ? null : ens.letter)}
                className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer py-0.5 transition-colors"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-3 w-3" /> Hide
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" /> Components
                  </>
                )}
              </button>

              {/* Component breakdown */}
              {isExpanded && (
                <div className="rounded-md border border-border/50 bg-muted/20 p-2 text-[11px] space-y-1">
                  {ens.components.map((c) => (
                    <div
                      key={c.symphony_id}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-muted-foreground flex-shrink-0">
                          {c.weight}%
                        </span>
                        <span className="truncate">{c.label}</span>
                      </div>
                      <span className={`flex-shrink-0 tabular-nums ${colorVal(c.today_return_pct)}`}>
                        {fmtPct(c.today_return_pct)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
