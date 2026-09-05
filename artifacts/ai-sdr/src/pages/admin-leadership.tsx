import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Building2, Calendar, Mail, Users, Shield, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Bar,
  BarChart,
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
import { Redirect } from "wouter";
import { useUser } from "@clerk/react";

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

interface AdminLeadershipStats {
  period: { days: number; start: string; end: string };
  totals: {
    clients: number;
    activeClients: number;
    suspendedClients: number;
    trialClients: number;
    paidClients: number;
    prospects: number;
    emails: number;
    calls: number;
    appointments: number;
  };
  dailyActivity: Array<{ date: string; emails: number; calls: number; appointments: number }>;
  clientPerformance: Array<{
    id: string;
    email: string | null;
    businessName: string | null;
    status: string;
    subscriptionPlan: string;
    prospects: number;
    emails: number;
    calls: number;
    appointments: number;
    lastActivity: string | null;
  }>;
  planBreakdown: Array<{ label: string; count: number }>;
  verticalBreakdown: Array<{ label: string; count: number }>;
}

const COLORS = {
  navy: "hsl(var(--primary))",
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

export default function AdminLeadership() {
  const [days, setDays] = useState("30");
  const { isLoaded, user } = useUser();

  const { data: meData, isLoading: meLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<{ isAdmin: boolean }>("/users/me"),
    enabled: isLoaded && !!user,
  });

  const { data, isLoading, error } = useQuery<AdminLeadershipStats>({
    queryKey: ["admin-leadership-stats", days],
    queryFn: () => apiFetch(`/admin/leadership?days=${days}`),
    enabled: !!meData?.isAdmin,
  });

  if (!isLoaded || meLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (meData && !meData.isAdmin) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-primary" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Admin / Platform Leadership</p>
            </div>
            <h2 className="text-[26px] font-semibold tracking-tight">Platform Performance</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Global client metrics, system-wide volume, and tenant health.
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
            <AlertDescription>We couldn't load the admin statistics. Please try again.</AlertDescription>
          </Alert>
        ) : isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
            </div>
            <Skeleton className="h-80 rounded-xl" />
          </div>
        ) : !data ? (
          <div className="py-20 text-center border rounded-xl bg-card">
            <Shield className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
            <h3 className="font-medium text-lg">No data available</h3>
            <p className="text-sm text-muted-foreground mt-1">Failed to load platform data.</p>
          </div>
        ) : (
          <>
            {/* Global KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="shadow-none border-border bg-card">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Clients</CardTitle>
                  <Building2 className="h-4 w-4 text-muted-foreground/60" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tracking-tight">{data.totals.clients.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
                    <span className="text-emerald-600 font-medium">{data.totals.paidClients} Paid</span>
                    <span>·</span>
                    <span>{data.totals.trialClients} Trial</span>
                    <span>·</span>
                    <span>{data.totals.suspendedClients} Suspended</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-none border-border bg-card">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Global Prospects</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground/60" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tracking-tight">{data.totals.prospects.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-1">Managed across all tenants</div>
                </CardContent>
              </Card>

              <Card className="shadow-none border-border bg-card">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Global Volume</CardTitle>
                  <Mail className="h-4 w-4 text-muted-foreground/60" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tracking-tight">{(data.totals.emails + data.totals.calls).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {data.totals.emails.toLocaleString()} emails · {data.totals.calls.toLocaleString()} calls
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-none border-border bg-card">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meetings Generated</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground/60" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tracking-tight text-emerald-600">{data.totals.appointments.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-1">Platform-wide value delivered</div>
                </CardContent>
              </Card>
            </div>

            {/* Global Activity Chart */}
            <Card className="shadow-none border-border">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Global Platform Activity</CardTitle>
                <CardDescription>Aggregated email, call, and meeting volume over time.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.dailyActivity} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                      <Bar dataKey="emails" name="Emails" fill={COLORS.navy} radius={[4, 4, 0, 0]} maxBarSize={40} />
                      <Bar dataKey="calls" name="Calls" fill={COLORS.neutral} radius={[4, 4, 0, 0]} maxBarSize={40} />
                      <Bar dataKey="appointments" name="Meetings" fill={COLORS.success} radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Plan Breakdown */}
              <Card className="shadow-none border-border">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Subscription Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center">
                  <div className="h-[200px] flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.planBreakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="count"
                          nameKey="label"
                        >
                          {data.planBreakdown.map((entry, index) => (
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
                    {data.planBreakdown.map((entry, index) => (
                      <div key={entry.label} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground capitalize">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                          {entry.label || "Unassigned"}
                        </div>
                        <div className="font-medium">{entry.count}</div>
                      </div>
                    ))}
                    {data.planBreakdown.length === 0 && (
                      <div className="text-sm text-muted-foreground">No subscription data</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Vertical Breakdown */}
              <Card className="shadow-none border-border">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Industry Verticals</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center">
                  <div className="h-[200px] flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.verticalBreakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="count"
                          nameKey="label"
                        >
                          {data.verticalBreakdown.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[(index + 2) % PIE_COLORS.length]} />
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
                    {data.verticalBreakdown.map((entry, index) => (
                      <div key={entry.label} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground capitalize">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[(index + 2) % PIE_COLORS.length] }} />
                          {entry.label?.replace("_", " ") || "Unassigned"}
                        </div>
                        <div className="font-medium">{entry.count}</div>
                      </div>
                    ))}
                    {data.verticalBreakdown.length === 0 && (
                      <div className="text-sm text-muted-foreground">No vertical data</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Client Performance Table */}
            <Card className="shadow-none border-border">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Client Performance</CardTitle>
                <CardDescription>Recent tenant activity and outcomes, sorted by latest activity.</CardDescription>
              </CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Client</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead className="text-right">Prospects</TableHead>
                      <TableHead className="text-right">Emails</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Meetings</TableHead>
                      <TableHead className="text-right">Last Active</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.clientPerformance.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                          No client data found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.clientPerformance.map((client) => (
                        <TableRow key={client.id}>
                          <TableCell>
                            <div className="font-medium text-sm text-foreground">{client.businessName || "Unnamed Business"}</div>
                            <div className="text-xs text-muted-foreground">{client.email}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={client.status === "active" ? "default" : "secondary"} className={client.status === "active" ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20" : ""}>
                              {client.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={client.subscriptionPlan === "paid" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : ""}
                            >
                              {client.subscriptionPlan}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{client.prospects.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{client.emails.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{client.calls.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium text-emerald-600">{client.appointments.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-muted-foreground text-xs">
                            {client.lastActivity ? new Date(client.lastActivity).toLocaleDateString() : "Never"}
                          </TableCell>
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
