import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, BarChart3, Calendar, Flame, Mail, PhoneCall, TrendingUp, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trackEvent } from "@/lib/analytics";

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

interface LeadershipStats {
  period: { days: number; start: string; end: string };
  totals: {
    prospects: number;
    emails: number;
    calls: number;
    appointments: number;
    hotProspects: number;
    completedCalls: number;
  };
  rates: {
    emailOpenRate: number;
    appointmentRate: number;
    callConnectRate: number;
  };
  dailyActivity: Array<{ date: string; emails: number; calls: number; appointments: number }>;
  pipeline: Array<{ status: string; count: number }>;
  campaigns: Array<{
    id: number;
    name: string;
    status: string;
    prospectCount: number;
    emailsSent: number;
    callsMade: number;
    appointmentsSet: number;
    appointmentRate: number;
  }>;
  callOutcomes: Array<{ outcome: string; count: number }>;
}

const COLORS = {
  navy: "hsl(var(--primary))",
  navyLight: "hsl(210 52% 45%)",
  neutral: "hsl(40 15% 70%)",
  accent: "hsl(35 72% 51%)",
  success: "hsl(142 71% 45%)",
};

const PIE_COLORS = [
  "hsl(210 52% 32%)",
  "hsl(200 56% 45%)",
  "hsl(221 34% 46%)",
  "hsl(210 28% 70%)",
  "hsl(40 15% 60%)",
];

export default function Leadership() {
  const [days, setDays] = useState("30");
  const lastTrackedPeriodRef = useRef<string | null>(null);

  const { data, isLoading, error } = useQuery<LeadershipStats>({
    queryKey: ["leadership-stats", days],
    queryFn: () => apiFetch(`/stats/leadership?days=${days}`),
  });

  useEffect(() => {
    if (data?.period.days !== Number(days) || lastTrackedPeriodRef.current === days) return;
    lastTrackedPeriodRef.current = days;
    trackEvent("leadership_period_viewed", { period_days: Number(days) });
  }, [data, days]);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary mb-2">Workspace / Leadership</p>
            <h2 className="text-[26px] font-semibold tracking-tight">Executive Summary</h2>
            <p className="text-sm text-muted-foreground mt-1">
              High-level performance metrics and pipeline health.
            </p>
          </div>
          <div className="w-36">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger>
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 Days</SelectItem>
                <SelectItem value="30">Last 30 Days</SelectItem>
                <SelectItem value="90">Last 90 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error loading stats</AlertTitle>
            <AlertDescription>We couldn't load the leadership statistics. Please try again.</AlertDescription>
          </Alert>
        ) : isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
            </div>
            <Skeleton className="h-80 rounded-xl" />
          </div>
        ) : !data ? (
          <div className="py-20 text-center border rounded-xl bg-card">
            <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
            <h3 className="font-medium text-lg">No data available</h3>
            <p className="text-sm text-muted-foreground mt-1">There is not enough activity data for the selected period.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
              <Card className="shadow-none border-border bg-card">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">New Prospects</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground/60" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tracking-tight">{data.totals.prospects.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-1 font-medium text-amber-600 flex items-center gap-1">
                    <Flame className="h-3 w-3" /> {data.totals.hotProspects} Hot Prospects
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-none border-border bg-card">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outreach Volume</CardTitle>
                  <Mail className="h-4 w-4 text-muted-foreground/60" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tracking-tight">
                    {(data.totals.emails + data.totals.calls).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {data.totals.emails.toLocaleString()} emails · {data.totals.calls.toLocaleString()} calls
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-none border-border bg-card">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email Open Rate</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground/60" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tracking-tight">{data.rates.emailOpenRate.toFixed(1)}%</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Across {data.totals.emails.toLocaleString()} sent emails
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-none border-border bg-card">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meetings Set</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground/60" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tracking-tight text-emerald-600">{data.totals.appointments.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {data.rates.appointmentRate.toFixed(1)}% conversion rate
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-none border-border bg-card">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connect Rate</CardTitle>
                  <PhoneCall className="h-4 w-4 text-muted-foreground/60" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tracking-tight">{data.rates.callConnectRate.toFixed(1)}%</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Of {data.totals.completedCalls.toLocaleString()} completed calls
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-none border-border">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Outreach Activity</CardTitle>
                <CardDescription>Daily emails sent, calls made, and meetings booked.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.dailyActivity} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorEmails" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.navy} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={COLORS.navy} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.neutral} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={COLORS.neutral} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorAppointments" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={COLORS.success} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        dy={10}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderColor: "hsl(var(--border))",
                          borderRadius: "0.5rem",
                          fontSize: "12px",
                        }}
                        labelFormatter={(val) => new Date(val).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                      />
                      <Area
                        type="monotone"
                        dataKey="emails"
                        name="Emails"
                        stroke={COLORS.navy}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorEmails)"
                      />
                      <Area
                        type="monotone"
                        dataKey="calls"
                        name="Calls"
                        stroke={COLORS.neutral}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorCalls)"
                      />
                      <Area
                        type="monotone"
                        dataKey="appointments"
                        name="Meetings"
                        stroke={COLORS.success}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorAppointments)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="shadow-none border-border">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Pipeline Distribution</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center">
                  <div className="h-[200px] flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.pipeline}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="count"
                          nameKey="status"
                        >
                          {data.pipeline.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: "0.5rem",
                            fontSize: "12px",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {data.pipeline.map((entry, index) => (
                      <div key={entry.status} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground capitalize">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                          {entry.status.replace(/_/g, " ")}
                        </div>
                        <div className="font-medium">{entry.count}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-none border-border">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Call Outcomes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {data.callOutcomes.map((item) => {
                      const total = data.totals.completedCalls || 1;
                      const percent = Math.round((item.count / total) * 100);
                      return (
                        <div key={item.outcome} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="capitalize text-muted-foreground">{item.outcome.replace(/_/g, " ")}</span>
                            <span className="font-medium">{item.count} <span className="text-xs text-muted-foreground ml-1">({percent}%)</span></span>
                          </div>
                          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${percent}%`,
                                backgroundColor: item.outcome === "meeting_booked" ? COLORS.success : COLORS.navy,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {data.callOutcomes.length === 0 && (
                      <div className="text-sm text-muted-foreground text-center py-8">No call data for this period</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-none border-border">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Campaign Performance</CardTitle>
                <CardDescription>All-time totals for your highest-performing campaigns.</CardDescription>
              </CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Campaign</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Prospects</TableHead>
                      <TableHead className="text-right">Emails Sent</TableHead>
                      <TableHead className="text-right">Calls Made</TableHead>
                      <TableHead className="text-right">Meetings</TableHead>
                      <TableHead className="text-right">Conv. Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.campaigns.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                          No campaigns found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.campaigns.map((camp) => (
                        <TableRow key={camp.id}>
                          <TableCell className="font-medium text-sm">{camp.name}</TableCell>
                          <TableCell>
                            <Badge variant={camp.status === "active" ? "default" : "secondary"} className={camp.status === "active" ? "bg-primary/10 text-primary hover:bg-primary/20" : ""}>
                              {camp.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{camp.prospectCount}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{camp.emailsSent}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{camp.callsMade}</TableCell>
                          <TableCell className="text-right font-medium text-emerald-600">{camp.appointmentsSet}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{camp.appointmentRate.toFixed(1)}%</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
