import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAppointments,
  useListProspects,
  useUpdateAppointment,
  useDeleteAppointment,
  getListAppointmentsQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar,
  Clock,
  MapPin,
  MoreVertical,
  CheckCircle2,
  RefreshCw,
  XCircle,
  Building2,
  FileText,
  CalendarDays,
} from "lucide-react";

type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show" | "rescheduled";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  scheduled:   { label: "Scheduled",   color: "bg-accent text-accent-foreground border-accent" },
  completed:   { label: "Completed",   color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  cancelled:   { label: "Cancelled",   color: "bg-red-100 text-red-800 border-red-200" },
  no_show:     { label: "No Show",     color: "bg-orange-100 text-orange-800 border-orange-200" },
  rescheduled: { label: "Rescheduled", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
};

const TYPE_LABELS: Record<string, string> = {
  walkthrough:      "Walkthrough",
  demo:             "Demo",
  discovery_call:   "Discovery Call",
  proposal_review:  "Proposal Review",
};

export default function Appointments() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data: appointments, isLoading } = useListAppointments();
  const { data: prospects } = useListProspects();
  const updateAppointment = useUpdateAppointment();
  const deleteAppointment = useDeleteAppointment();

  const [rescheduleApt, setRescheduleApt] = useState<any>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("10:00");
  const [rescheduleNotes, setRescheduleNotes] = useState("");

  const prospectMap = Object.fromEntries(
    (prospects ?? []).map((p) => [p.id, p])
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey() });

  const handleStatusUpdate = (id: number, status: AppointmentStatus) => {
    updateAppointment.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          toast({ title: `Appointment marked as "${STATUS_CONFIG[status]?.label ?? status}"` });
          invalidate();
        },
        onError: () => toast({ title: "Failed to update", variant: "destructive" }),
      }
    );
  };

  const handleReschedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleApt) return;
    const scheduledAt = new Date(`${rescheduleDate}T${rescheduleTime}`).toISOString();
    updateAppointment.mutate(
      {
        id: rescheduleApt.id,
        data: {
          scheduledAt,
          status: "rescheduled",
          notes: rescheduleNotes || rescheduleApt.notes || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Rescheduled", description: `New time: ${new Date(scheduledAt).toLocaleString()}` });
          setRescheduleApt(null);
          invalidate();
        },
        onError: () => toast({ title: "Failed to reschedule", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteAppointment.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Appointment deleted" });
          invalidate();
        },
        onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
      }
    );
  };

  const openReschedule = (apt: any) => {
    const d = new Date(apt.scheduledAt);
    setRescheduleDate(d.toISOString().split("T")[0]);
    setRescheduleTime(d.toTimeString().slice(0, 5));
    setRescheduleNotes(apt.notes ?? "");
    setRescheduleApt(apt);
  };

  const now = new Date();
  const upcoming = (appointments ?? [])
    .filter((a) => new Date(a.scheduledAt) >= now && a.status === "scheduled")
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  const past = (appointments ?? [])
    .filter((a) => new Date(a.scheduledAt) < now || a.status !== "scheduled")
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

  const renderCard = (apt: any) => {
    const date = new Date(apt.scheduledAt);
    const isPast = date < now || apt.status !== "scheduled";
    const prospect = prospectMap[apt.prospectId];
    const status = STATUS_CONFIG[apt.status] ?? { label: apt.status, color: "bg-gray-100 text-gray-700 border-gray-200" };
    const isToday = date.toDateString() === now.toDateString();

    return (
      <Card key={apt.id} className={isPast ? "opacity-70" : ""}>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-4 flex-1 min-w-0">
              <div className={`shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-xl border-2 text-center ${isPast ? "border-muted bg-muted/40" : "border-primary/30 bg-primary/5"}`}>
                <span className={`text-xs font-semibold uppercase tracking-wide ${isPast ? "text-muted-foreground" : "text-primary"}`}>
                  {date.toLocaleString("default", { month: "short" })}
                </span>
                <span className={`text-xl font-bold leading-tight ${isPast ? "text-muted-foreground" : "text-primary"}`}>
                  {date.getDate()}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-base">
                    {TYPE_LABELS[apt.type] ?? apt.type}
                  </span>
                  {isToday && !isPast && (
                    <Badge className="bg-primary text-primary-foreground text-xs px-2 py-0">Today</Badge>
                  )}
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${status.color}`}>
                    {status.label}
                  </span>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {apt.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {apt.location}
                    </span>
                  )}
                  {prospect && (
                    <button
                      onClick={() => navigate(`/prospects/${apt.prospectId}`)}
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      {prospect.companyName}
                    </button>
                  )}
                </div>

                {apt.notes && (
                  <p className="mt-2 text-xs text-muted-foreground flex items-start gap-1.5">
                    <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    {apt.notes}
                  </p>
                )}
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {apt.status === "scheduled" && (
                  <>
                    <DropdownMenuItem onClick={() => handleStatusUpdate(apt.id, "completed")}>
                      <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                      Mark as Completed
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openReschedule(apt)}>
                      <RefreshCw className="mr-2 h-4 w-4 text-primary" />
                      Reschedule
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleStatusUpdate(apt.id, "no_show")}>
                      <XCircle className="mr-2 h-4 w-4 text-orange-500" />
                      Mark as No Show
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleStatusUpdate(apt.id, "cancelled")} className="text-red-600">
                      <XCircle className="mr-2 h-4 w-4" />
                      Cancel Appointment
                    </DropdownMenuItem>
                  </>
                )}
                {apt.status !== "scheduled" && (
                  <DropdownMenuItem onClick={() => openReschedule(apt)}>
                    <RefreshCw className="mr-2 h-4 w-4 text-primary" />
                    Reschedule
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(`/prospects/${apt.prospectId}`)}>
                  <Building2 className="mr-2 h-4 w-4" />
                  View Prospect
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleDelete(apt.id)} className="text-red-600">
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Walkthroughs & Appointments</h2>
          <p className="text-muted-foreground mt-1">
            Manage your scheduled walkthroughs, demos, and discovery calls.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}><CardContent className="h-20 animate-pulse bg-muted rounded-xl" /></Card>
            ))}
          </div>
        ) : (appointments ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <CalendarDays className="h-12 w-12 text-muted-foreground/40" />
            <p className="font-semibold text-muted-foreground">No appointments yet</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Book a walkthrough from any prospect's detail page to see it here.
            </p>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm uppercase tracking-wide text-primary">
                    Upcoming ({upcoming.length})
                  </h3>
                </div>
                {upcoming.map(renderCard)}
              </section>
            )}

            {past.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                    Past & Completed ({past.length})
                  </h3>
                </div>
                {past.map(renderCard)}
              </section>
            )}
          </>
        )}
      </div>

      <Dialog open={!!rescheduleApt} onOpenChange={(o) => !o && setRescheduleApt(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Reschedule Appointment</DialogTitle>
            <DialogDescription>
              Pick a new date and time for this {rescheduleApt ? TYPE_LABELS[rescheduleApt.type] ?? rescheduleApt?.type : ""}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReschedule} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  required
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Time</label>
                <Input
                  type="time"
                  required
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Notes <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Textarea
                rows={3}
                placeholder="Reason for reschedule, new instructions..."
                value={rescheduleNotes}
                onChange={(e) => setRescheduleNotes(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setRescheduleApt(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateAppointment.isPending}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {updateAppointment.isPending ? "Saving…" : "Confirm Reschedule"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
