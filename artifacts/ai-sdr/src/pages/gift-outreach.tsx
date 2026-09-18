import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Loader2, Video, MailOpen, Link as LinkIcon, Gift, PlayCircle, Eye, Calendar, ExternalLink, CalendarCheck } from "lucide-react";
import { useLocation } from "wouter";
import { getGiftVideoDashboard } from "@workspace/api-client-react";

export default function GiftOutreachDashboard() {
  const [, setLocation] = useLocation();
  const search = new URLSearchParams(window.location.search);
  const campaignId = search.get("campaignId") || undefined;
  const prospectId = search.get("prospectId") || undefined;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["gift-outreach-dashboard", campaignId, prospectId],
    queryFn: () => getGiftVideoDashboard({
      campaignId: campaignId ? Number(campaignId) : undefined,
      prospectId: prospectId ? Number(prospectId) : undefined,
    }),
  });

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Gift Outreach Tracking</h1>
            <p className="text-muted-foreground mt-1">Monitor engagement and video performance for gifted prospects</p>
          </div>
        </div>

        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-red-500">
            <h3 className="font-semibold">Failed to load dashboard</h3>
            <p className="text-sm mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
          </div>
        ) : !data?.cards?.length ? (
          <div className="rounded-xl border border-dashed p-12 text-center bg-card">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Gift className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg">No gift outreach yet</h3>
            <p className="text-muted-foreground mt-1 max-w-sm mx-auto">
              When you send personalized videos via the gift outreach campaign, you'll see engagement metrics here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {data.trackingNotice && (
              <p className="text-xs text-muted-foreground px-1">{data.trackingNotice}</p>
            )}
            
            <div className="grid gap-6">
              {data.cards.map(card => (
                <div key={card.video.id} className="rounded-xl border bg-card overflow-hidden">
                  <div className="border-b bg-muted/30 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{card.prospectName}</h3>
                        <span className="text-muted-foreground text-sm">at {card.company}</span>
                        {card.leadStrength === "Hot" && (
                          <span className="bg-red-500/10 text-red-500 border border-red-500/20 text-xs px-2 py-0.5 rounded-full font-medium ml-2">Hot Lead</span>
                        )}
                        {card.leadStrength === "Medium" && (
                          <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-xs px-2 py-0.5 rounded-full font-medium ml-2">Warm Lead</span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1 flex items-center gap-4">
                        <span>{card.campaignName}</span>
                        <span>•</span>
                        <span>{card.step}</span>
                        <span>•</span>
                        <span>Score: {card.engagementScore}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {card.actions.call && (
                        <Button variant="outline" size="sm" onClick={() => window.location.href = card.actions.call!}>
                          Call
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => window.location.href = card.actions.email}>
                        Email
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setLocation(card.actions.viewProspect)}>
                        View Prospect
                      </Button>
                      <Button variant="default" size="sm" onClick={() => setLocation(card.actions.scheduleFollowUp)}>
                        Schedule Follow-up
                      </Button>
                    </div>
                  </div>
                  
                  <div className="p-6 grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="space-y-4">
                      <div className="text-sm font-medium text-muted-foreground mb-2">Delivery & Open</div>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${card.delivered ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                          <MailOpen className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">Delivered</div>
                          <div className="text-xs text-muted-foreground">
                            {card.delivered ? (card.deliveredAt ? new Date(card.deliveredAt).toLocaleDateString() : "Yes") : "No"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${card.emailOpened ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                          <Eye className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">Email Opened</div>
                          <div className="text-xs text-muted-foreground">
                            {card.emailOpened ? (card.emailOpenedAt ? new Date(card.emailOpenedAt).toLocaleDateString() : "Yes") : "No"}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="text-sm font-medium text-muted-foreground mb-2">Video Engagement</div>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${card.videoClicked ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                          <PlayCircle className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">Video Clicked</div>
                          <div className="text-xs text-muted-foreground">
                            {card.totalClicks > 0 ? `${card.totalClicks} clicks (${card.uniqueClicks} unique)` : "No"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${card.videoStarted ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                          <Video className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">Watch Completion</div>
                          <div className="text-xs text-muted-foreground">
                            {card.analyticsAvailable 
                              ? (card.videoStarted ? `${card.watchPercentage}% watched` : "Not started")
                              : card.analyticsLabel}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="text-sm font-medium text-muted-foreground mb-2">Next Steps</div>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${card.schedulingLinkClicked ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                          <LinkIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">Calendar Clicked</div>
                          <div className="text-xs text-muted-foreground">{card.schedulingLinkClicked ? "Yes" : "No"}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${card.discoveryCallBooked ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                          <CalendarCheck className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">Meeting Booked</div>
                          <div className="text-xs text-muted-foreground">{card.discoveryCallBooked ? "Yes" : "No"}</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-2 bg-muted/20 p-4 rounded-lg border border-dashed">
                      <div className="text-sm font-medium text-muted-foreground mb-1">Status</div>
                      <div className="text-base font-semibold">{card.status}</div>
                      
                      <div className="text-sm font-medium text-muted-foreground mt-4 mb-1">Recommended Action</div>
                      <div className="text-sm">{card.nextAction}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
