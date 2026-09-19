import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Gift, Sparkles, RefreshCw, X } from "lucide-react";
import {
  useListCampaigns, listProspectGiftOutreachRecords, getGiftOutreachSettings,
  createGiftOutreachRecord, patchGiftOutreachRecord, prepareGiftOutreachRecord,
  approveGiftOutreachRecord, sendGiftOutreachRecord, skipGiftOutreachRecord,
  useGetProspectGiftSuggestions, useGenerateProspectGiftSuggestions,
  type GiftOutreachRecord, type GiftOutreachRecordEdit, type GiftOutreachSettings,
} from "@workspace/api-client-react";
import { GiftVideoEditor } from "@/components/gift-video-editor";
import { GiftShoppingLinks } from "@/components/gift-shopping-links";
import { invalidateGiftQueries, listGiftEnrollments } from "@/lib/gift-outreach";

export function GiftRecordEditor({ prospectId, campaignId }: { prospectId: number; campaignId?: number }) {
  const client = useQueryClient();
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | undefined>(campaignId);
  const [method, setMethod] = useState<"email" | "video" | "">("");
  const [optInEnrollment, setOptInEnrollment] = useState(false);
  const [selectedGiftName, setSelectedGiftName] = useState<string | null>(null);
  useEffect(() => {
    setSelectedGiftName(null);
  }, [prospectId]);
  const campaigns = useListCampaigns();
  const records = useQuery({
    queryKey: ["gift-records", prospectId],
    queryFn: () => listProspectGiftOutreachRecords(prospectId),
  });
  const settings = useQuery({ queryKey: ["gift-outreach-settings"], queryFn: () => getGiftOutreachSettings() });
  const enrollments = useQuery({ queryKey: ["gift-autopilot-enrollments"], queryFn: listGiftEnrollments });
  const selectedId = selectedCampaignId ?? (records.data?.length === 1 ? records.data[0].campaignId : undefined);
  const record = records.data?.find(item => item.campaignId === selectedId);
  const enrollment = enrollments.data?.find(item => item.prospectId === prospectId && item.campaignId === selectedId);
  const needsOptIn = !!enrollment && !enrollment.giftMode;
  const tooLate = needsOptIn && (enrollment.currentStep > 1 || !["active", "paused"].includes(enrollment.status));
  const effectiveMethod = method || (settings.data?.defaultMethod === "per_prospect" ? undefined : settings.data?.defaultMethod);
  const create = useMutation({
    mutationFn: () => createGiftOutreachRecord({
      prospectId, campaignId: selectedId!, method: effectiveMethod,
      ...(selectedGiftName ? { giftName: selectedGiftName } : {}),
      ...(needsOptIn ? { optInEnrollment } : {}),
    }),
    onSuccess: async () => { setSelectedGiftName(null); await invalidateGiftQueries(client); },
  });
  const error = records.error || settings.error || campaigns.error || enrollments.error;
  const suggestions = <GiftSuggestionsPanel
    key={prospectId}
    prospectId={prospectId}
    selectedGiftName={selectedGiftName}
    onSelect={setSelectedGiftName}
    selectionDisabled={!!record && ["sending", "sent", "skipped", "stopped"].includes(record.status)}
  />;
  if (error) return <div className="space-y-6">{suggestions}<p role="alert" className="text-sm text-red-500">Unable to load gift outreach: {error.message}</p></div>;
  if (records.isLoading || settings.isLoading || enrollments.isLoading || campaigns.isLoading) {
    return <div className="space-y-6">{suggestions}<div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div></div>;
  }
  return (
    <div className="space-y-6">
      {suggestions}
      <div className="space-y-4 border-t pt-6">
      {!campaignId && <label className="block text-sm font-medium">Campaign
        <select className="ml-2 h-9 rounded-md border bg-background px-3 text-sm" value={selectedId ?? ""} onChange={e => { setSelectedCampaignId(Number(e.target.value) || undefined); setOptInEnrollment(false); }}>
          <option value="">Select a campaign</option>
          {campaigns.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>}
      {record && settings.data ? <GiftRecordForm
        key={record.id}
        record={record}
        settings={settings.data}
        selectedGiftName={selectedGiftName}
        onSelectedGiftNameChange={setSelectedGiftName}
      /> : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">No gift outreach record exists for this prospect and campaign.</p>
          <label className="block text-sm font-medium">Method
            <select className="ml-2 h-9 rounded-md border bg-background px-3 text-sm" value={effectiveMethod ?? ""} onChange={e => setMethod(e.target.value as "email" | "video" | "")}>
              <option value="">Choose per-prospect method</option>
              <option value="email">Email</option><option value="video">Video Email</option>
            </select>
          </label>
          {needsOptIn && !tooLate && <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={optInEnrollment} onChange={e => setOptInEnrollment(e.target.checked)} />
            Explicitly opt this untouched Autopilot enrollment into the 8-step gift sequence.
          </label>}
          {tooLate && <p className="text-sm text-amber-600">This enrollment has already progressed or stopped. It cannot be converted to gift outreach.</p>}
          {!settings.data?.enabled && <p className="text-sm text-amber-600">Enable Gift Outreach in Settings before creating a record.</p>}
          <Button disabled={!selectedId || !settings.data?.enabled || create.isPending || tooLate || (needsOptIn && !optInEnrollment)} onClick={() => create.mutate()}>
            {create.isPending ? "Creating…" : "Start Gift Outreach"}
          </Button>
          {create.error && <p role="alert" className="text-sm text-red-500">{create.error.message}</p>}
        </div>
      )}
      </div>
    </div>
  );
}

function GiftSuggestionsPanel({
  prospectId,
  selectedGiftName,
  onSelect,
  selectionDisabled,
}: {
  prospectId: number;
  selectedGiftName: string | null;
  onSelect: (name: string | null) => void;
  selectionDisabled: boolean;
}) {
  const [budget, setBudget] = useState("25");
  const suggestions = useGetProspectGiftSuggestions(prospectId);
  const generate = useGenerateProspectGiftSuggestions({
    mutation: {
      onSuccess: data => {
        suggestions.refetch();
        setBudget(String(data.budgetUsd));
      },
    },
  });
  const budgetNumber = Number(budget);
  const budgetValid = Number.isInteger(budgetNumber) && budgetNumber >= 10 && budgetNumber <= 100;
  const data = generate.data ?? suggestions.data;
  const loadError = suggestions.error;
  const generationError = generate.error;
  return (
    <section aria-labelledby="gift-suggestions-heading" className="rounded-lg border bg-muted/20 p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="gift-suggestions-heading" className="font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Gift Suggestions
          </h3>
          <p className="text-sm text-muted-foreground mt-1">Practical, professional ideas based only on known prospect and seller context.</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-xs font-medium">
            Budget (USD)
            <Input
              className="mt-1 w-24"
              type="number"
              min={10}
              max={100}
              step={1}
              value={budget}
              onChange={event => setBudget(event.target.value)}
              aria-invalid={!budgetValid}
            />
          </label>
          <Button
            variant={data ? "outline" : "default"}
            onClick={() => generate.mutate({ prospectId, data: { budgetUsd: budgetNumber } })}
            disabled={!budgetValid || generate.isPending}
          >
            {generate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : data ? <RefreshCw className="mr-2 h-4 w-4" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {generate.isPending ? "Generating…" : data ? "Refresh ideas" : "Generate ideas"}
          </Button>
        </div>
      </div>
      {!budgetValid && <p role="alert" className="text-sm text-red-500">Enter a whole-dollar budget from $10 to $100.</p>}
      {suggestions.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading saved ideas…</div>}
      {(loadError || generationError) && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-red-500">{generationError?.message ?? loadError?.message ?? "Unable to load gift suggestions."}</p>
          <Button size="sm" variant="outline" disabled={!budgetValid || generate.isPending} onClick={() => generate.mutate({ prospectId, data: { budgetUsd: budgetNumber } })}>Retry</Button>
        </div>
      )}
      {!suggestions.isLoading && !data && !loadError && !generationError && (
        <p className="text-sm text-muted-foreground">No saved ideas yet. Generate ideas without starting a gift record or sending anything.</p>
      )}
      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {data.ideas.map((idea, ideaIndex) => {
              const selected = selectedGiftName === idea.name;
              return (
                <article key={idea.name} className={`rounded-md border bg-background p-4 space-y-2 ${selected ? "border-primary ring-1 ring-primary" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-medium">{idea.name}</h4>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">Estimated ${idea.estimatedPriceMinUsd}–${idea.estimatedPriceMaxUsd} USD</span>
                  </div>
                  <p className="text-sm">{idea.description}</p>
                  <p className="text-sm text-muted-foreground"><strong className="text-foreground">Why it may fit:</strong> {idea.whyFit}</p>
                   <GiftShoppingLinks
                     key={`${data.generatedAt}:${prospectId}:${ideaIndex}:${idea.name}`}
                     giftName={idea.name}
                     prospectId={prospectId}
                     ideaIndex={ideaIndex}
                     savedComparison={idea.offerComparison}
                   />
                  <Button size="sm" variant={selected ? "secondary" : "outline"} disabled={selectionDisabled} onClick={() => onSelect(idea.name)}>
                    {selected ? "Selected for gift name" : "Use this idea"}
                  </Button>
                </article>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Prices are estimates, not live quotes. Confirm availability, recipient employer gift policies, and any government or regulated-industry restrictions before purchasing or sending.</p>
        </>
      )}
      {selectedGiftName && (
        <div className="flex items-center justify-between gap-3 rounded-md bg-primary/5 px-3 py-2 text-sm">
          <span>Pending choice: <strong>{selectedGiftName}</strong>. Save the gift record to apply it; nothing is purchased, approved, or sent.</span>
          <Button variant="ghost" size="sm" onClick={() => onSelect(null)}><X className="mr-1 h-4 w-4" /> Clear</Button>
        </div>
      )}
    </section>
  );
}

function GiftRecordForm({
  record,
  settings,
  selectedGiftName,
  onSelectedGiftNameChange,
}: {
  record: GiftOutreachRecord;
  settings: GiftOutreachSettings;
  selectedGiftName: string | null;
  onSelectedGiftNameChange: (name: string | null) => void;
}) {
  const client = useQueryClient();
  const [local, setLocal] = useState<GiftOutreachRecordEdit>({});
  const [videoBusy, setVideoBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!selectedGiftName) return;
    setLocal(previous => {
      if (!Object.hasOwn(previous, "giftName")) return previous;
      const { giftName: _giftName, ...rest } = previous;
      return rest;
    });
  }, [selectedGiftName]);
  const current = { ...record, ...(selectedGiftName ? { giftName: selectedGiftName } : {}), ...local };
  const dirty = Object.keys(local).length > 0 || (!!selectedGiftName && selectedGiftName !== record.giftName);
  const locked = ["sending", "sent", "skipped", "stopped"].includes(record.status);
  const update = (patch: GiftOutreachRecordEdit) => setLocal(previous => ({ ...previous, ...patch }));
  const cacheRecord = async (updated: GiftOutreachRecord) => {
    client.setQueryData<GiftOutreachRecord[]>(["gift-records", record.prospectId], previous => previous?.map(item => item.id === updated.id ? updated : item));
    await invalidateGiftQueries(client);
  };
  const save = useMutation({
    mutationFn: () => patchGiftOutreachRecord(record.id, { ...(selectedGiftName ? { giftName: selectedGiftName } : {}), ...local }),
    onSuccess: async updated => { await cacheRecord(updated); setLocal({}); onSelectedGiftNameChange(null); setMessage("Saved. Changes require a fresh approval."); },
  });
  const actions = {
    prepare: prepareGiftOutreachRecord, approve: approveGiftOutreachRecord,
    send: sendGiftOutreachRecord, skip: skipGiftOutreachRecord,
  };
  const action = useMutation({
    mutationFn: (name: keyof typeof actions) => {
      if (dirty || videoBusy || save.isPending) throw new Error("Save or discard changes before continuing.");
      return actions[name](record.id);
    },
    onSuccess: async updated => { await cacheRecord(updated); setMessage("Action successful."); },
  });
  const busy = save.isPending || action.isPending;
  const guarded = dirty || videoBusy || busy || locked || !settings.enabled;
  const validGift = !current.giftSent || (!!current.giftName?.trim() && !!current.sentDate);
  const prepared = !!record.draftSubject && !!record.draftBody && !!record.preparedMethod;
  const approved = record.approvedRevision === record.revision;
  const requiresApproval = settings.automationLevel !== "auto" || record.complianceRisk;
  const error = save.error || action.error;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Gift className="w-5 h-5 text-primary" /> Gift Record</h3>
          <p className="text-sm text-muted-foreground mt-1">Status: <span className="font-medium text-foreground">{record.status}</span></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => save.mutate()} disabled={!dirty || busy || videoBusy || locked || !validGift}>Save Changes</Button>
          {dirty && <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setLocal({}); onSelectedGiftNameChange(null); }}>Discard Changes</Button>}
          {!locked && !approved && <Button size="sm" onClick={() => action.mutate("approve")} disabled={guarded || !prepared}>Approve</Button>}
          {!locked && <Button size="sm" onClick={() => action.mutate("send")} disabled={guarded || !prepared || (requiresApproval && !approved) || record.status !== "ready"}>Send Manually</Button>}
          {!locked && <Button variant="secondary" size="sm" onClick={() => action.mutate("skip")} disabled={guarded}>Skip Gift</Button>}
        </div>
      </div>
      {!settings.enabled && <p className="text-sm text-amber-600">Gift Outreach is paused in Settings. This record keeps its gift sequence; it will not send a legacy replacement.</p>}
      {(dirty || videoBusy) && <p className="text-sm text-amber-600">Save or discard record changes and finish editing the video before preparing, approving, or sending.</p>}
      {!validGift && <p className="text-sm text-red-500">Gift name and sent date are required when the gift has been sent.</p>}
      {record.lastError && <p role="alert" className="text-sm text-red-500">{record.lastError}</p>}
      {error && <p role="alert" className="text-sm text-red-500">{error.message}</p>}
      {message && <p role="status" className="text-sm text-emerald-600">{message}</p>}
      {record.complianceRisk && <p className="text-sm text-amber-600"><strong>Compliance Risk:</strong> {record.complianceNotes}</p>}
      {record.dueAt && <p className="text-sm text-muted-foreground">Due: {new Date(record.dueAt).toLocaleString()} · Sending hours: {settings.businessHoursStart}–{settings.businessHoursEnd} ({settings.timezone})</p>}
      <fieldset disabled={locked || busy || videoBusy} className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h4 className="font-medium text-sm border-b pb-2">Gift Details</h4>
          <label className="block text-xs font-medium">
            Gift Name{current.giftSent ? " *" : ""}
            <Input
              required={!!current.giftSent}
              value={current.giftName ?? ""}
              onChange={e => { onSelectedGiftNameChange(null); update({ giftName: e.target.value }); }}
              placeholder="Choose an idea above or enter a gift"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={!!current.giftSent} onCheckedChange={giftSent => update({ giftSent })} /> Gift has been sent</label>
          {current.giftSent && <>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium">Date Sent *<Input required type="date" value={current.sentDate ?? ""} onChange={e => update({ sentDate: e.target.value || null })} /></label>
              <label className="text-xs font-medium">Expected Delivery<Input type="date" value={current.expectedDeliveryDate ?? ""} onChange={e => update({ expectedDeliveryDate: e.target.value || null })} /></label>
            </div>
            <label className="block text-xs font-medium">Confirmed Delivery (Manual)<Input type="date" value={current.confirmedDeliveryDate ?? ""} onChange={e => update({ confirmedDeliveryDate: e.target.value || null })} /></label>
            <p className="text-xs text-muted-foreground">Delivery source: {record.deliverySource ?? "Not confirmed"}. No carrier tracking integration is implied.</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium">Carrier<Input value={current.carrier ?? ""} onChange={e => update({ carrier: e.target.value })} /></label>
              <label className="text-xs font-medium">Tracking Number<Input value={current.trackingReference ?? ""} onChange={e => update({ trackingReference: e.target.value })} /></label>
            </div>
            <label className="block text-xs font-medium">Amount Spent ($)<Input type="number" min="0" step="0.01" value={current.amountSpent ?? ""} onChange={e => update({ amountSpent: e.target.value || null })} /></label>
            <label className="block text-xs font-medium">Gift Note Used<Textarea rows={2} value={current.giftNote ?? ""} onChange={e => update({ giftNote: e.target.value })} /></label>
          </>}
        </div>
        <div className="space-y-4">
          <h4 className="font-medium text-sm border-b pb-2">Follow-up Preparation</h4>
          <label className="block text-xs font-medium">Preferred Name<Input value={current.preferredName ?? ""} onChange={e => update({ preferredName: e.target.value })} /></label>
          <label className="block text-xs font-medium">Method
            <select className="w-full h-9 rounded-md border bg-background px-3 text-sm" value={current.method ?? ""} onChange={e => update({ method: e.target.value === "email" || e.target.value === "video" ? e.target.value : null })}>
              <option value="">Choose a method</option><option value="email">Email</option><option value="video">Video Email</option>
            </select>
          </label>
          {record.draftSubject != null && <div className="space-y-2 mt-4 pt-4 border-t">
            <h5 className="font-medium text-sm">AI Draft {record.preparedMethod && `(${record.preparedMethod})`}</h5>
            <label className="block text-xs font-medium">Subject<Input value={current.draftSubject ?? ""} onChange={e => update({ draftSubject: e.target.value })} /></label>
            <label className="block text-xs font-medium">Body<Textarea rows={6} value={current.draftBody ?? ""} onChange={e => update({ draftBody: e.target.value })} /></label>
          </div>}
        </div>
      </fieldset>
      {current.method === "video" && <GiftVideoEditor record={record} settings={settings} disabled={dirty || busy || locked} onBusyChange={setVideoBusy} />}
      {current.method && current.giftSent && current.sentDate && <Button variant="outline" className="w-full" onClick={() => action.mutate("prepare")} disabled={guarded || !validGift || (current.method === "video" && !record.videoId && settings.videoFallback !== "email")}>
        {current.draftSubject ? "Re-generate AI Draft" : "Generate AI Draft"}
      </Button>}
      {current.method === "video" && !record.videoId && <p className="text-xs text-muted-foreground">{settings.videoFallback === "email" ? "No video attached. Preparing will create an email fallback for review." : "Attach a video before preparing the message."}</p>}
    </div>
  );
}