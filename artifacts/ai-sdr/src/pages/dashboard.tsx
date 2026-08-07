import { useGetDashboardStats, useGetActivityFeed } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");
async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, Mail, PhoneCall, Calendar, ArrowUpRight, Eye, MousePointerClick, Paperclip, AlertTriangle, Flame, Info, Send, CalendarCheck, ShieldCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EngagementTable } from "@/components/engagement-table";
import { Link } from "wouter";

function StatCard({ title, value, sub, icon, tooltip }: {
  title: string;
  value: number | string;
  sub?: React.ReactNode;
  icon: React.ReactNode;
  tooltip?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          {title}
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px]">{tooltip}</TooltipContent>
            </Tooltip>
          )}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

interface EngagementSummary {
  emailsSent: number;
  emailsDelivered: number;
  emailsBounced: number;
  totalOpens: number;
  validOpens: number;
  prospectsWhoOpened: number;
  repeatedOpenProspects: number;
  linksClicked: number;
  attachmentsViewed: number;
  attachmentDownloads: number;
  calendlyClicks: number;
  hotProspects: number;
  mediumProspects: number;
  lowProspects: number;
  meetingRequestsSent: number;
  meetingsScheduled: number;
  botClicksFiltered: number;
  botOpensFiltered: number;
}

function useEngagementSummary() {
  return useQuery<EngagementSummary>({
    queryKey: ["engagement-summary"],
    queryFn: () => apiFetch<EngagementSummary>("/engagement/summary"),
    staleTime: 60_000,
  });
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: activity, isLoading: activityLoading } = useGetActivityFeed({ limit: 10 });
  const { data: engagement, isLoading: engagementLoading } = useEngagementSummary();

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Overview</h2>
          <p className="text-muted-foreground mt-1">
            Here's what's happening with your outreach pipeline today.
          </p>
        </div>

        {statsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Prospects</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalProspects}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.activeProspects} active in pipeline
                </p>
              </CardContent>
            </Card>
            <Link href="/emails" className="block">
              <Card className="transition-colors hover:border-primary/50 hover:bg-accent/40 cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Emails Sent</CardTitle>
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.emailsSent}</div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    This month <ArrowUpRight className="h-3 w-3" />
                  </p>
                </CardContent>
              </Card>
            </Link>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Calls Made</CardTitle>
                <PhoneCall className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.callsMade}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  This month
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Appointments</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.appointmentsSet}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.appointmentsCompleted} completed
                </p>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Prospect Engagement and Buying Intent */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Prospect Engagement and Buying Intent</h3>
            <p className="text-sm text-muted-foreground">
              Who's opening, clicking, and ready to talk — across all your outreach.
            </p>
          </div>
          {engagementLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : engagement ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard title="Emails Sent" value={engagement.emailsSent} icon={<Send className="h-4 w-4 text-blue-500" />} />
              <StatCard title="Emails Delivered" value={engagement.emailsDelivered}
                sub={engagement.emailsBounced > 0 ? <span className="text-red-500">{engagement.emailsBounced} bounced</span> : "confirmed by provider"}
                icon={<Mail className="h-4 w-4 text-green-500" />} />
              <StatCard title="Prospects Who Opened" value={engagement.prospectsWhoOpened}
                tooltip="Open tracking is an estimate — privacy protections and email scanners can hide real opens or trigger false ones."
                icon={<Users className="h-4 w-4 text-blue-500" />} />
              <StatCard title="Total Valid Opens" value={engagement.validOpens}
                sub={`${engagement.totalOpens} total incl. bots`}
                tooltip="Open tracking is an estimate — privacy protections and email scanners can hide real opens or trigger false ones. Obvious bot opens are filtered out."
                icon={<Eye className="h-4 w-4 text-blue-500" />} />
              <StatCard title="Repeated-Open Prospects" value={engagement.repeatedOpenProspects} sub="3+ valid opens"
                icon={<AlertTriangle className="h-4 w-4 text-orange-500" />} />
              <StatCard title="Attachments Viewed" value={engagement.attachmentsViewed}
                sub={`${engagement.attachmentDownloads} downloaded`}
                icon={<Paperclip className="h-4 w-4 text-purple-500" />} />
              <StatCard title="Links Clicked" value={engagement.linksClicked} icon={<MousePointerClick className="h-4 w-4 text-green-500" />} />
              <StatCard title="Hot / Medium / Low"
                value={`${engagement.hotProspects} / ${engagement.mediumProspects} / ${engagement.lowProspects}`}
                sub="prospects by interest level"
                icon={<Flame className="h-4 w-4 text-orange-500" />} />
              <StatCard title="Automated Meeting Requests Sent" value={engagement.meetingRequestsSent}
                sub="triggered by repeated opens"
                icon={<Send className="h-4 w-4 text-primary" />} />
              <StatCard title="Calendly Links Clicked" value={engagement.calendlyClicks} icon={<MousePointerClick className="h-4 w-4 text-primary" />} />
              <StatCard title="Meetings Scheduled" value={engagement.meetingsScheduled} icon={<CalendarCheck className="h-4 w-4 text-emerald-500" />} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No engagement data yet — stats appear once emails are sent.</p>
          )}
          {engagement && (engagement.botClicksFiltered > 0 || engagement.botOpensFiltered > 0) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground cursor-help">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span>
                    {[
                      engagement.botOpensFiltered > 0 ? `${engagement.botOpensFiltered} bot open${engagement.botOpensFiltered === 1 ? "" : "s"}` : null,
                      engagement.botClicksFiltered > 0 ? `${engagement.botClicksFiltered} bot click${engagement.botClicksFiltered === 1 ? "" : "s"}` : null,
                    ].filter(Boolean).join(" and ")} filtered
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px]">
                Automated activity from email security scanners was detected and excluded from the counts above and from prospect interest scores.
              </TooltipContent>
            </Tooltip>
          )}
          <EngagementTable />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Pipeline Status</CardTitle>
              <CardDescription>Current prospect distribution</CardDescription>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-64" />
              ) : stats?.prospectsByStatus ? (
                <div className="space-y-4">
                  {stats.prospectsByStatus.map(status => (
                    <div key={status.status} className="flex items-center">
                      <div className="w-32 text-sm capitalize">{status.status.replace(/_/g, ' ')}</div>
                      <div className="flex-1 px-4">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full" 
                            style={{ width: `${Math.max(1, (status.count / stats.totalProspects) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="w-12 text-right text-sm font-medium">{status.count}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">No data available</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest actions taken</CardDescription>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12" />)}
                </div>
              ) : activity?.length ? (
                <div className="space-y-6">
                  {activity.map(item => (
                    <div key={item.id} className="flex gap-4">
                      <div className="mt-0.5">
                        {item.type === 'email_sent' && <Mail className="h-4 w-4 text-blue-500" />}
                        {item.type === 'call_made' && <PhoneCall className="h-4 w-4 text-green-500" />}
                        {item.type === 'appointment_set' && <Calendar className="h-4 w-4 text-purple-500" />}
                        {item.type === 'status_changed' && <ArrowUpRight className="h-4 w-4 text-orange-500" />}
                        {item.type === 'prospect_added' && <Users className="h-4 w-4 text-primary" />}
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {item.prospectId ? (
                            <Link href={`/prospects/${item.prospectId}`} className="hover:underline">
                              {item.prospectName || 'Prospect'}
                            </Link>
                          ) : (
                            item.description
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.prospectId ? item.description : ''} • {new Date(item.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No recent activity
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
