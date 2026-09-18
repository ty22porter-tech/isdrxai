import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createGiftVideo, deleteGiftVideo, getGiftVideo, updateGiftVideo,
  type GiftOutreachRecord, type GiftOutreachSettings, type GiftVideo, type GiftVideoUpdate,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Play, Video } from "lucide-react";
import { invalidateGiftQueries, uploadGiftFile } from "@/lib/gift-outreach";

export function GiftVideoEditor({ record, settings, disabled, onBusyChange }: {
  record: GiftOutreachRecord;
  settings: GiftOutreachSettings;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const query = useQuery({
    queryKey: ["gift-video", record.videoId],
    queryFn: () => getGiftVideo(record.videoId!),
    enabled: !!record.videoId,
  });
  const remove = useMutation({
    mutationFn: () => deleteGiftVideo(record.videoId!),
    onMutate: () => onBusyChange(true),
    onSuccess: async () => { await invalidateGiftQueries(client); },
    onSettled: () => onBusyChange(false),
  });
  const changeOpen = (value: boolean) => {
    if (saving) return;
    setOpen(value);
    onBusyChange(value);
  };
  const video = query.data;
  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      {query.isFetching && <p className="text-sm"><Loader2 className="inline w-4 h-4 animate-spin" /> Loading video…</p>}
      {query.error && <p role="alert" className="text-sm text-red-500">{query.error.message}</p>}
      {remove.error && <p role="alert" className="text-sm text-red-500">{remove.error.message}</p>}
      {video && (
        <div className="flex gap-3">
          <img src={`${video.posterUrl}?v=${encodeURIComponent(video.updatedAt)}`} alt="Video thumbnail" className="w-24 h-16 object-cover rounded-md" />
          <div>
            <h5 className="font-medium text-sm">{video.title}</h5>
            <p className="text-xs text-muted-foreground">{video.hasThumbnail ? "Custom thumbnail" : "Generated thumbnail"}</p>
            <a href={video.watchUrl} target="_blank" rel="noreferrer" className="text-xs text-primary flex items-center gap-1"><Play className="w-3 h-3" /> Preview</a>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="outline" disabled={disabled || remove.isPending || (!!record.videoId && !video)} onClick={() => changeOpen(true)}>
          <Video className="w-4 h-4 mr-2" /> {video ? "Edit Video" : "Attach Personalized Video"}
        </Button>
        {video && <Button variant="ghost" disabled={disabled || remove.isPending} onClick={() => remove.mutate()}>Remove Video</Button>}
      </div>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{video ? "Edit Personalized Video" : "Upload Personalized Video"}</DialogTitle></DialogHeader>
          {open && <GiftVideoForm record={record} settings={settings} video={video} onSaving={setSaving} onSuccess={() => { setOpen(false); onBusyChange(false); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function localDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function GiftVideoForm({ record, settings, video, onSuccess, onSaving }: {
  record: GiftOutreachRecord;
  settings: GiftOutreachSettings;
  video?: GiftVideo;
  onSuccess: () => void;
  onSaving: (saving: boolean) => void;
}) {
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [thumb, setThumb] = useState<File | null>(null);
  const [removeThumbnail, setRemoveThumbnail] = useState(false);
  const [title, setTitle] = useState(video?.title ?? "");
  const [prospectName, setProspectName] = useState(video?.prospectName ?? record.preferredName ?? "");
  const [giftName, setGiftName] = useState(video?.giftName ?? record.giftName ?? "");
  const [giftSentDate, setGiftSentDate] = useState(video?.giftSentDate ?? record.sentDate ?? "");
  const [cta, setCta] = useState(video?.cta ?? settings.videoCta);
  const [schedulingLink, setSchedulingLink] = useState(video?.schedulingLink ?? settings.schedulingLink);
  const [expiresAt, setExpiresAt] = useState(localDateTime(video?.expiresAt));
  const [introduction, setIntroduction] = useState(video?.introduction ?? "");
  const [transcript, setTranscript] = useState(video?.transcript ?? "");
  const [showName, setShowName] = useState(video?.showNameOnThumbnail ?? true);
  const save = useMutation({
    mutationFn: async () => {
      if (!video && !file) throw new Error("Choose an MP4 video.");
      if (![title, prospectName, giftName, giftSentDate, cta, schedulingLink].every(value => value.trim())) throw new Error("Complete all required fields.");
      const url = new URL(schedulingLink);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("Use an absolute HTTPS scheduling URL.");
      const expiration = expiresAt ? new Date(expiresAt).toISOString() : null;
      if (expiration && Date.parse(expiration) <= Date.now()) throw new Error("Expiration must be in the future.");
      const fields = {
        title: title.trim(), prospectName: prospectName.trim(), giftName: giftName.trim(), giftSentDate,
        cta: cta.trim(), schedulingLink: schedulingLink.trim(), introduction, transcript,
        showNameOnThumbnail: showName, expiresAt: expiration,
      };
      const uploads: GiftVideoUpdate = {};
      if (file) uploads.uploadId = await uploadGiftFile(file, "video");
      if (thumb) uploads.thumbnailUploadId = await uploadGiftFile(thumb, "thumbnail");
      else if (removeThumbnail) uploads.thumbnailUploadId = null;
      if (video) return updateGiftVideo(video.id, { ...fields, ...uploads });
      return createGiftVideo({ ...fields, ...uploads, recordId: record.id, uploadId: uploads.uploadId! });
    },
    onMutate: () => onSaving(true),
    onSuccess: async updated => {
      client.setQueryData(["gift-video", updated.id], updated);
      await invalidateGiftQueries(client);
      onSuccess();
    },
    onSettled: () => onSaving(false),
  });
  return (
    <form className="space-y-4 pt-2" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
      {save.error && <p role="alert" className="text-red-500 text-sm">{save.error.message}</p>}
      <fieldset disabled={save.isPending} className="space-y-4">
        <label className="block text-xs font-medium">Video File (MP4, max 100 MiB) {video ? "(optional replacement)" : "*"}
          <Input type="file" accept="video/mp4" required={!video} onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <label className="block text-xs font-medium">Custom Thumbnail (optional, max 5 MiB)
          <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { setThumb(e.target.files?.[0] ?? null); setRemoveThumbnail(false); }} />
        </label>
        {video?.hasThumbnail && <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={removeThumbnail} onChange={e => { setRemoveThumbnail(e.target.checked); if (e.target.checked) setThumb(null); }} /> Remove custom thumbnail
        </label>}
        <label className="flex items-center gap-2 text-sm"><Switch checked={showName} onCheckedChange={setShowName} /> Show prospect name on thumbnail</label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium">Video Title *<Input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
          <label className="text-xs font-medium">Prospect Name *<Input required maxLength={200} value={prospectName} onChange={e => setProspectName(e.target.value)} /></label>
          <label className="text-xs font-medium">Gift Name *<Input required maxLength={200} value={giftName} onChange={e => setGiftName(e.target.value)} /></label>
          <label className="text-xs font-medium">Gift Sent Date *<Input required type="date" value={giftSentDate} onChange={e => setGiftSentDate(e.target.value)} /></label>
        </div>
        <label className="block text-xs font-medium">Call to Action text *<Input required maxLength={500} value={cta} onChange={e => setCta(e.target.value)} /></label>
        <label className="block text-xs font-medium">Scheduling Link *<Input required type="url" pattern="https://.*" value={schedulingLink} onChange={e => setSchedulingLink(e.target.value)} /></label>
        <label className="block text-xs font-medium">Expires At (optional, local time)<Input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /></label>
        <label className="block text-xs font-medium">Short Introduction<Textarea maxLength={3000} rows={2} value={introduction} onChange={e => setIntroduction(e.target.value)} /></label>
        <label className="block text-xs font-medium">Transcript/Captions<Textarea maxLength={30000} rows={3} value={transcript} onChange={e => setTranscript(e.target.value)} /></label>
        <p className="text-xs text-muted-foreground">Saving video changes invalidates approval. Prepare and approve the updated message before sending.</p>
        <Button type="submit" className="w-full" disabled={save.isPending || (!video && !file)}>{save.isPending ? "Saving…" : video ? "Save Video Changes" : "Attach Video"}</Button>
      </fieldset>
    </form>
  );
}