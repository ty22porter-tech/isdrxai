import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Flame } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export const INTEREST_STYLES: Record<string, string> = {
  hot: "bg-orange-500/15 text-orange-500 border-orange-500/40",
  medium: "bg-amber-400/15 text-amber-500 border-amber-400/40",
  low: "bg-muted text-muted-foreground border-border",
};

export const INTEREST_LABELS: Record<string, string> = {
  hot: "Hot Prospect",
  medium: "Medium Interest",
  low: "Low Interest",
};

/** Interest badge trio with manual override via dropdown. */
export function InterestBadge({ prospect, showLabel = false }: { prospect: any; showLabel?: boolean }) {
  const qc = useQueryClient();
  const effective = prospect.manualInterestLevel ?? prospect.interestLevel ?? "low";
  const isOverridden = !!prospect.manualInterestLevel;

  const setOverride = async (level: string | null) => {
    await fetch(`${BASE}/api/prospects/${prospect.id}/interest-override`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level }),
    });
    qc.invalidateQueries();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button onClick={e => e.stopPropagation()} className="inline-flex" aria-label="Set interest level">
          <Badge variant="outline" className={`${INTEREST_STYLES[effective] ?? INTEREST_STYLES.low} cursor-pointer gap-1`}>
            {effective === "hot" && <Flame className="h-3 w-3" />}
            {showLabel ? INTEREST_LABELS[effective] ?? effective : effective.toUpperCase()}
            <span className="font-normal opacity-70">· {prospect.engagementScore ?? 0}</span>
            {isOverridden && <span className="font-normal opacity-70">(manual)</span>}
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={e => e.stopPropagation()}>
        <DropdownMenuLabel className="text-xs">
          System score: {prospect.engagementScore ?? 0} ({(prospect.interestLevel ?? "low").toUpperCase()})
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(["hot", "medium", "low"] as const).map(l => (
          <DropdownMenuItem key={l} onClick={() => setOverride(l)}>
            Override as {INTEREST_LABELS[l]}
          </DropdownMenuItem>
        ))}
        {isOverridden && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setOverride(null)}>Clear override (use system score)</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
