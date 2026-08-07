import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { INTEREST_STYLES, INTEREST_LABELS } from "@/components/interest-badge";
import { Search, Download, ArrowUpDown, ArrowUp, ArrowDown, Info, Flame } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface EngagementRow {
  prospectId: number;
  companyName: string;
  contactName: string;
  email: string;
  campaigns: string;
  emailsSent: number;
  emailsDelivered: number;
  emailsBounced: number;
  totalOpens: number;
  validOpens: number;
  lastOpenedAt: string | null;
  attachmentViewed: boolean;
  attachmentDownloads: number;
  linksClicked: number;
  botOpensFiltered: number;
  botClicksFiltered: number;
  botOpenReasons: { reason: string; count: number }[];
  botClickReasons: { reason: string; count: number }[];
  calendlyClicked: boolean;
  interestScore: number;
  interestLevel: "low" | "medium" | "hot";
  manualOverride: boolean;
  meetingRequestSent: boolean;
  meetingRequestPending: boolean;
  meetingScheduled: boolean;
  nextAction: string;
  nextActionReason: string;
}

interface TableResponse {
  total: number;
  page: number;
  pageSize: number;
  campaigns: { id: number; name: string }[];
  rows: EngagementRow[];
}

const PAGE_SIZE = 25;

// Human-readable labels for the bot-filter reason codes recorded by tracking.
const BOT_REASON_LABELS: Record<string, string> = {
  "security-scanner": "Email security scanner",
  bot: "Bot / crawler user-agent",
  "http-client": "Automated HTTP client",
  prefetch: "Mail app prefetch",
  "prefetch-window": "Opened seconds after send (likely prefetch)",
  "click-burst": "Burst of clicks within a short window",
  "no-user-agent": "No browser identification",
  unspecified: "Automated pattern",
};
const botReasonLabel = (reason: string) => BOT_REASON_LABELS[reason] ?? reason;

function BotReasonList({ reasons }: { reasons: { reason: string; count: number }[] }) {
  if (!reasons?.length) return null;
  return (
    <ul className="mt-1.5 space-y-0.5 border-t border-border/50 pt-1.5">
      {reasons.map(r => (
        <li key={r.reason} className="flex justify-between gap-3">
          <span>{botReasonLabel(r.reason)}</span>
          <span className="text-muted-foreground tabular-nums">×{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

function buildParams(state: Record<string, string>, extra: Record<string, string> = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...state, ...extra })) {
    if (v && v !== "all") params.set(k, v);
  }
  return params.toString();
}

export function EngagementTable() {
  useQueryClient();
  const [search, setSearch] = useState("");
  const [interest, setInterest] = useState("all");
  const [campaignId, setCampaignId] = useState("all");
  const [attachment, setAttachment] = useState("all");
  const [meetingRequest, setMeetingRequest] = useState("all");
  const [sort, setSort] = useState("interestScore");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const filterState = { search, interest, campaignId, attachment, meetingRequest, sort, dir };
  const qs = buildParams(filterState, { page: String(page), pageSize: String(PAGE_SIZE) });

  const { data, isLoading } = useQuery<TableResponse>({
    queryKey: ["engagement-table", qs],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/engagement/table?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const toggleSort = (key: string) => {
    if (sort === key) setDir(d => (d === "desc" ? "asc" : "desc"));
    else { setSort(key); setDir("desc"); }
    setPage(1);
  };

  const sortIcon = (key: string) =>
    sort !== key ? <ArrowUpDown className="h-3 w-3 opacity-50" /> : dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />;

  const exportCsv = async () => {
    const res = await fetch(`${BASE}/api/engagement/table?${buildParams(filterState, { format: "csv" })}`, { credentials: "include" });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prospect-engagement-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const SortableHead = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <TableHead>
      <button className="flex items-center gap-1 whitespace-nowrap font-medium" onClick={() => toggleSort(k)}>
        {children} {sortIcon(k)}
      </button>
    </TableHead>
  );

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Prospect Engagement</CardTitle>
            <CardDescription>Sortable, filterable engagement detail per prospect</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 h-9"
              placeholder="Search company, contact, email…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={interest} onValueChange={v => { setInterest(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Interest</SelectItem>
              <SelectItem value="hot">Hot Prospect</SelectItem>
              <SelectItem value="medium">Medium Interest</SelectItem>
              <SelectItem value="low">Low Interest</SelectItem>
            </SelectContent>
          </Select>
          <Select value={campaignId} onValueChange={v => { setCampaignId(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Campaigns</SelectItem>
              {data?.campaigns.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={attachment} onValueChange={v => { setAttachment(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Attachment: Any</SelectItem>
              <SelectItem value="viewed">Attachment Viewed</SelectItem>
              <SelectItem value="not_viewed">Attachment Not Viewed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={meetingRequest} onValueChange={v => { setMeetingRequest(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Meeting Request: Any</SelectItem>
              <SelectItem value="sent">Meeting Request Sent</SelectItem>
              <SelectItem value="not_sent">Meeting Request Not Sent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10" />)}</div>
        ) : data?.rows.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead k="companyName">Prospect</SortableHead>
                  <TableHead className="whitespace-nowrap">Campaign</TableHead>
                  <TableHead className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      Email Opens
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[260px]">
                          Open tracking is an estimate. Privacy protections and email scanners can hide real opens or trigger false ones; obvious bot opens are filtered out of "Valid Opens".
                        </TooltipContent>
                      </Tooltip>
                    </span>
                  </TableHead>
                  <SortableHead k="totalOpens">Total Opens</SortableHead>
                  <SortableHead k="validOpens">Valid Opens</SortableHead>
                  <SortableHead k="lastOpenedAt">Last Opened</SortableHead>
                  <TableHead className="whitespace-nowrap">Attachment Viewed</TableHead>
                  <TableHead className="whitespace-nowrap">Links Clicked</TableHead>
                  <SortableHead k="interestScore">Interest Score</SortableHead>
                  <TableHead className="whitespace-nowrap">Interest Level</TableHead>
                  <TableHead className="whitespace-nowrap">Meeting Request Sent</TableHead>
                  <TableHead className="whitespace-nowrap">Calendly Link Clicked</TableHead>
                  <TableHead className="whitespace-nowrap">Meeting Scheduled</TableHead>
                  <TableHead className="whitespace-nowrap">Recommended Next Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map(r => (
                  <TableRow key={r.prospectId}>
                    <TableCell>
                      <Link href={`/prospects/${r.prospectId}`} className="hover:underline">
                        <div className="font-medium whitespace-nowrap">{r.companyName}</div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">{r.contactName}</div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">{r.campaigns || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{r.emailsSent} sent / {r.emailsDelivered} delivered</TableCell>
                    <TableCell className="text-center">{r.totalOpens}</TableCell>
                    <TableCell className="text-center font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        {r.validOpens}
                        {r.botOpensFiltered > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-[10px] font-normal text-muted-foreground cursor-help whitespace-nowrap">({r.botOpensFiltered} filtered)</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[260px]">
                              {r.botOpensFiltered} open{r.botOpensFiltered === 1 ? "" : "s"} looked like automated scanner/bot activity and {r.botOpensFiltered === 1 ? "was" : "were"} excluded from valid opens and scoring.
                              <BotReasonList reasons={r.botOpenReasons} />
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{r.lastOpenedAt ? new Date(r.lastOpenedAt).toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-center">
                      {r.attachmentViewed
                        ? <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/30">{r.attachmentDownloads > 0 ? "Downloaded" : "Viewed"}</Badge>
                        : <span className="text-muted-foreground text-xs">No</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center gap-1.5">
                        {r.linksClicked}
                        {r.botClicksFiltered > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-[10px] text-muted-foreground cursor-help whitespace-nowrap">({r.botClicksFiltered} filtered)</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[260px]">
                              {r.botClicksFiltered} click{r.botClicksFiltered === 1 ? "" : "s"} looked like automated scanner/bot activity and {r.botClicksFiltered === 1 ? "was" : "were"} excluded from link clicks and scoring.
                              <BotReasonList reasons={r.botClickReasons} />
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-center font-medium">{r.interestScore}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`${INTEREST_STYLES[r.interestLevel]} gap-1 whitespace-nowrap`}>
                        {r.interestLevel === "hot" && <Flame className="h-3 w-3" />}
                        {INTEREST_LABELS[r.interestLevel]}
                        {r.manualOverride && <span className="font-normal opacity-70">(manual)</span>}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {r.meetingRequestSent ? "Yes" : r.meetingRequestPending ? "Queued" : "No"}
                    </TableCell>
                    <TableCell className="text-center text-xs">{r.calendlyClicked ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-center text-xs">{r.meetingScheduled ? "Yes" : "No"}</TableCell>
                    <TableCell className="max-w-[220px]">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs font-medium cursor-help">{r.nextAction}</span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[260px]">{r.nextActionReason}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between p-4 border-t text-sm">
              <span className="text-muted-foreground">
                {data.total} prospect{data.total === 1 ? "" : "s"} · page {data.page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">No prospects match these filters.</div>
        )}
      </CardContent>
    </Card>
  );
}
