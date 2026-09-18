import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle, Gift, Info } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";

export type GiftOutreachSettings = {
  enabled: boolean;
  defaultMethod: "email" | "video" | "per_prospect";
  daysAfterDelivery: number;
  sentOnlyBusinessDays: number;
  industry: string;
  serviceDescriptions: string;
  discussionPoints: string;
  schedulingLink: string;
  emailSignature: string;
  videoHostingPreference: "managed";
  videoCta: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  timezone: string;
  allowedDays: number[];
  automationLevel: "auto" | "review" | "manual";
  videoFallback: "pause" | "email";
  maxFollowUpAttempts: number;
};

async function fetchSettings(): Promise<GiftOutreachSettings> {
  const res = await fetch("/api/gift-outreach/settings", { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

async function patchSettings(settings: Partial<GiftOutreachSettings>): Promise<GiftOutreachSettings> {
  const res = await fetch("/api/gift-outreach/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

export function GiftOutreachSettingsPanel() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["gift-outreach-settings"],
    queryFn: fetchSettings,
  });

  const mutation = useMutation({
    mutationFn: patchSettings,
    onSuccess: (updated) => {
      queryClient.setQueryData(["gift-outreach-settings"], updated);
      setSaveMsg({ type: "ok", text: "Settings saved successfully" });
      setTimeout(() => setSaveMsg(null), 3000);
    },
    onError: (err: Error) => {
      setSaveMsg({ type: "err", text: err.message });
    },
  });

  // Local state for edits
  const [local, setLocal] = useState<Partial<GiftOutreachSettings>>({});
  
  // Initialize local state when data loads
  const current = { ...data, ...local } as GiftOutreachSettings;

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border bg-card p-6">
        <p className="text-sm text-red-500">Failed to load gift outreach settings.</p>
      </div>
    );
  }

  const handleSave = () => {
    mutation.mutate(local);
  };

  const update = (key: keyof GiftOutreachSettings, value: any) => {
    setLocal(prev => ({ ...prev, [key]: value }));
  };

  const toggleDay = (day: number) => {
    const days = current.allowedDays || [];
    if (days.includes(day)) {
      update("allowedDays", days.filter(d => d !== day));
    } else {
      update("allowedDays", [...days, day].sort());
    }
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div 
        className="p-6 cursor-pointer flex items-center justify-between hover:bg-muted/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${current.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
            <Gift className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-base">Professional Gift Outreach</h3>
            <p className="text-sm text-muted-foreground">
              {current.enabled ? "Active — 8-step campaign enabled" : "Disabled — standard 7-step campaign"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Switch 
            checked={current.enabled} 
            onCheckedChange={(c) => {
              update("enabled", c);
              mutation.mutate({ enabled: c });
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      {isOpen && (
        <div className="p-6 pt-0 border-t space-y-6">
          
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-sm">
            <h4 className="font-medium flex items-center gap-2 mb-1">
              <Info className="w-4 h-4" /> About Gift Outreach
            </h4>
            <p className="text-muted-foreground">
              Enabling this converts the standard 7-step campaign into an 8-step campaign for new prospects by adding a Gift action as Step 2 and a Package Follow-Up as Step 3. Existing campaigns are paused safely.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="font-medium text-sm border-b pb-2">Follow-Up Method (Step 3)</h4>
              
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Default follow-up method</label>
                <select 
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={current.defaultMethod}
                  onChange={(e) => update("defaultMethod", e.target.value)}
                >
                  <option value="email">AI-Written Email</option>
                  <option value="video">Personalized MP4 Video Email</option>
                  <option value="per_prospect">Choose Separately for Each Prospect</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Automation level</label>
                <select 
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={current.automationLevel}
                  onChange={(e) => update("automationLevel", e.target.value)}
                >
                  <option value="auto">Fully Automated</option>
                  <option value="review">Review Before Sending (Recommended)</option>
                  <option value="manual">Manual</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Days after delivery</label>
                  <input 
                    type="number" min="1" max="10"
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    value={current.daysAfterDelivery}
                    onChange={(e) => update("daysAfterDelivery", Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Days after sent (fallback)</label>
                  <input 
                    type="number" min="3" max="5"
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    value={current.sentOnlyBusinessDays}
                    onChange={(e) => update("sentOnlyBusinessDays", Number(e.target.value))}
                  />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Video fallback</label>
                <select 
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={current.videoFallback}
                  onChange={(e) => update("videoFallback", e.target.value)}
                >
                  <option value="pause">Pause and wait</option>
                  <option value="email">Send AI-written email</option>
                </select>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Max follow-up attempts</label>
                <input 
                  type="number" min="1" max="5"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={current.maxFollowUpAttempts}
                  onChange={(e) => update("maxFollowUpAttempts", Number(e.target.value))}
                />
              </div>

            </div>

            <div className="space-y-4">
              <h4 className="font-medium text-sm border-b pb-2">Business Settings</h4>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Sending timezone</label>
                  <input 
                    type="text"
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    value={current.timezone}
                    onChange={(e) => update("timezone", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-muted-foreground">Start</label>
                    <input 
                      type="time"
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                      value={current.businessHoursStart}
                      onChange={(e) => update("businessHoursStart", e.target.value)}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-medium text-muted-foreground">End</label>
                    <input 
                      type="time"
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                      value={current.businessHoursEnd}
                      onChange={(e) => update("businessHoursEnd", e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Allowed days</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5, 6, 7].map(day => (
                    <button
                      key={day}
                      onClick={() => toggleDay(day)}
                      className={`w-8 h-8 rounded-full text-xs font-medium flex items-center justify-center border transition-colors ${current.allowedDays?.includes(day) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-input hover:border-primary/50'}`}
                    >
                      {["M","T","W","T","F","S","S"][day - 1]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Scheduling link</label>
                <input 
                  type="url"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={current.schedulingLink}
                  onChange={(e) => update("schedulingLink", e.target.value)}
                  placeholder="https://calendly.com/..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Video CTA text</label>
                <input 
                  type="text"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={current.videoCta}
                  onChange={(e) => update("videoCta", e.target.value)}
                />
              </div>

            </div>
          </div>
          
          <div className="space-y-4">
            <h4 className="font-medium text-sm border-b pb-2">Content Customization</h4>
            
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Industry focus</label>
                <input 
                  type="text"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={current.industry}
                  onChange={(e) => update("industry", e.target.value)}
                  placeholder="e.g. B2B SaaS"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Email signature</label>
                <input 
                  type="text"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={current.emailSignature}
                  onChange={(e) => update("emailSignature", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Service descriptions</label>
              <textarea 
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                value={current.serviceDescriptions}
                onChange={(e) => update("serviceDescriptions", e.target.value)}
                placeholder="Briefly describe what your service offers..."
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Industry-specific operational discussion points</label>
              <textarea 
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                value={current.discussionPoints}
                onChange={(e) => update("discussionPoints", e.target.value)}
                placeholder="Priorities to bring up in the follow-up..."
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-4 border-t">
            {saveMsg && (
              <div className={`rounded-lg px-4 py-3 flex items-center gap-2 text-sm ${saveMsg.type === "ok" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
                {saveMsg.type === "ok" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                {saveMsg.text}
              </div>
            )}
            
            <Button
              className="w-full"
              disabled={mutation.isPending || Object.keys(local).length === 0}
              onClick={handleSave}
            >
              {mutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save Gift Settings"}
            </Button>
          </div>

        </div>
      )}
    </div>
  );
}
