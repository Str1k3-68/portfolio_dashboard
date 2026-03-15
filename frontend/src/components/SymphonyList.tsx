"use client";

import { useState, useCallback, useMemo } from "react";
import { SymphonyInfo } from "@/lib/api";
import { InfoTooltip } from "./InfoTooltip";
import { RefreshCw, ChevronUp, ChevronDown } from "lucide-react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

interface Props {
  symphonies: SymphonyInfo[];
  showAccountColumn: boolean;
  onSelect: (symphony: SymphonyInfo) => void;
  onRefresh?: () => void | Promise<void>;
  refreshLoading?: boolean;
  autoRefreshEnabled?: boolean;
  ensembleFilter?: string | null;
}

type SortKey = "name" | "today_pct" | "deposits" | "value" | "profit" | "return" | "twr" | "account";
type SortDir = "asc" | "desc";

function fmtDollar(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function getSortValue(s: SymphonyInfo, key: SortKey): number | string {
  switch (key) {
    case "name": return s.name.toLowerCase();
    case "account": return (s.account_name ?? "").toLowerCase();
    case "today_pct": return s.last_percent_change;
    case "deposits": return s.net_deposits;
    case "value": return s.value;
    case "profit": return s.total_return;
    case "return": return s.cumulative_return_pct;
    case "twr": return s.time_weighted_return;
    default: return 0;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronDown className="h-3 w-3 opacity-0 group-hover:opacity-30" />;
  return dir === "asc"
    ? <ChevronUp className="h-3 w-3 text-foreground" />
    : <ChevronDown className="h-3 w-3 text-foreground" />;
}

export function SymphonyList({ symphonies, showAccountColumn, onSelect, onRefresh, refreshLoading, autoRefreshEnabled = true, ensembleFilter }: Props) {
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const wrappedRefresh = useCallback(async () => {
    await onRefresh?.();
    setLastRefreshed(new Date());
  }, [onRefresh]);

  useAutoRefresh(wrappedRefresh, 60_000, !!onRefresh && autoRefreshEnabled);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      // Default sort direction: desc for numbers, asc for text
      setSortDir(key === "name" || key === "account" ? "asc" : "desc");
      return key;
    });
  }, []);

  const filteredSymphonies = useMemo(() => {
    let list = ensembleFilter
      ? symphonies.filter((s) => s.ensemble_tags?.some((t) => t.letter === ensembleFilter))
      : symphonies;

    return [...list].sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      let cmp: number;
      if (typeof va === "string" && typeof vb === "string") {
        cmp = va.localeCompare(vb);
      } else {
        cmp = (va as number) - (vb as number);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [symphonies, ensembleFilter, sortKey, sortDir]);

  const count = filteredSymphonies.length;

  if (!symphonies.length) {
    return (
      <div data-testid="section-symphonies" className="rounded-xl border border-border bg-card p-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Symphonies</h3>
          {onRefresh && (
            <div className="flex items-center gap-3">
              {lastRefreshed && (
                <span data-testid="symphony-last-refreshed" className="text-xs text-muted-foreground">{lastRefreshed.toLocaleTimeString()}</span>
              )}
              <button
                onClick={wrappedRefresh}
                disabled={refreshLoading}
                className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                title="Refresh symphonies"
              >
                <RefreshCw className={`h-4 w-4 ${refreshLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">No active symphonies found.</p>
      </div>
    );
  }

  const thClass = "pb-2 pr-3 font-medium whitespace-nowrap cursor-pointer select-none group transition-colors hover:text-foreground";

  return (
    <div data-testid="section-symphonies" className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Active Symphonies
          <span className="ml-2 inline-flex items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {count}
          </span>
        </h3>
        {onRefresh && (
          <div className="flex items-center gap-3">
            {lastRefreshed && (
              <span data-testid="symphony-last-refreshed" className="text-xs text-muted-foreground">{lastRefreshed.toLocaleTimeString()}</span>
            )}
            <button
              onClick={wrappedRefresh}
              disabled={refreshLoading}
              className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              title="Refresh symphonies"
            >
              <RefreshCw className={`h-4 w-4 ${refreshLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        )}
      </div>
      <div
        data-testid="symphony-table"
        className="max-h-[800px] overflow-y-auto overflow-x-hidden"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent" }}
      >
        {ensembleFilter && (
          <div className="mb-2 text-xs text-muted-foreground">
            Showing symphonies in <span className="font-semibold text-foreground">Alt {ensembleFilter}</span>
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wider">
              {showAccountColumn && (
                <th className={thClass} onClick={() => handleSort("account")}>
                  <span className="inline-flex items-center gap-1">
                    Account <SortIcon active={sortKey === "account"} dir={sortDir} />
                  </span>
                </th>
              )}
              <th className={`${thClass} w-full`} onClick={() => handleSort("name")}>
                <span className="inline-flex items-center gap-1">
                  Name <SortIcon active={sortKey === "name"} dir={sortDir} />
                </span>
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort("today_pct")}>
                <span className="inline-flex items-center gap-1 justify-end">
                  Today <SortIcon active={sortKey === "today_pct"} dir={sortDir} />
                </span>
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort("deposits")}>
                <span className="inline-flex items-center gap-1 justify-end">
                  Deposits <SortIcon active={sortKey === "deposits"} dir={sortDir} />
                </span>
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort("value")}>
                <span className="inline-flex items-center gap-1 justify-end">
                  Value <SortIcon active={sortKey === "value"} dir={sortDir} />
                </span>
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort("profit")}>
                <span className="inline-flex items-center gap-1 justify-end">
                  Profit <SortIcon active={sortKey === "profit"} dir={sortDir} />
                </span>
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort("return")}>
                <span className="inline-flex items-center gap-1 justify-end">
                  Return <SortIcon active={sortKey === "return"} dir={sortDir} />
                  <InfoTooltip text="Cumulative Return" />
                </span>
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort("twr")}>
                <span className="inline-flex items-center gap-1 justify-end">
                  TWR <SortIcon active={sortKey === "twr"} dir={sortDir} />
                  <InfoTooltip text="Time Weighted Return" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredSymphonies.map((s) => (
              <tr
                key={`${s.account_id}-${s.id}`}
                data-testid={`symphony-row-${s.id}`}
                onClick={() => onSelect(s)}
                className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/50"
              >
                {showAccountColumn && (
                  <td className="py-2.5 pr-3 text-muted-foreground max-w-[120px] truncate">{s.account_name}</td>
                )}
                <td className="py-2.5 pr-3 font-medium truncate" title={s.name}>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="truncate">{s.name}</span>
                    {s.ensemble_tags?.map((tag) => (
                      <span
                        key={tag.letter}
                        className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold flex-shrink-0"
                        style={{
                          backgroundColor: `${tag.color}20`,
                          color: tag.color,
                        }}
                        title={`${tag.name} — ${tag.weight}% weight`}
                      >
                        {tag.letter}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                  <span className={colorVal(s.last_percent_change)}>
                    {fmtPct(s.last_percent_change)}
                  </span>
                  <span className={`block text-xs ${colorVal(s.last_dollar_change)}`}>
                    {fmtDollar(s.last_dollar_change)}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                  ${s.net_deposits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                  ${s.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className={`py-2.5 pr-3 text-right whitespace-nowrap ${colorVal(s.total_return)}`}>
                  {fmtDollar(s.total_return)}
                </td>
                <td className={`py-2.5 pr-3 text-right whitespace-nowrap ${colorVal(s.cumulative_return_pct)}`}>
                  {fmtPct(s.cumulative_return_pct)}
                </td>
                <td className={`py-2.5 pr-3 text-right whitespace-nowrap ${colorVal(s.time_weighted_return)}`}>
                  {fmtPct(s.time_weighted_return)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
