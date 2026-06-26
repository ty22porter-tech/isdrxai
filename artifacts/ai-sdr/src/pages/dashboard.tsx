import { useGetDashboardStats, useGetActivityFeed } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, Mail, PhoneCall, Calendar, ArrowUpRight, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: activity, isLoading: activityLoading } = useGetActivityFeed({ limit: 10 });

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
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Emails Sent</CardTitle>
                <Mail className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.emailsSent}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  This month
                </p>
              </CardContent>
            </Card>
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
