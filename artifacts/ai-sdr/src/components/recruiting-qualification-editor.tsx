import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateProspect, getGetProspectQueryKey, getListProspectsQueryKey } from "@workspace/api-client-react";
import type { RecruitingQualification } from "@workspace/api-client-react";
import { ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { QUALIFICATION_FIELDS, cleanQualification } from "@/lib/recruiting";

/** Structured employer qualification; only sends recruitingQualification so other prospect fields stay intact. */
export function RecruitingQualificationEditor({
  prospectId,
  value,
}: {
  prospectId: number;
  value?: RecruitingQualification | null;
}) {
  const [draft, setDraft] = useState<RecruitingQualification>(value ?? {});
  const [editing, setEditing] = useState(false);
  const initFor = useRef<number | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();
  const update = useUpdateProspect();

  useEffect(() => {
    if (initFor.current !== prospectId) {
      initFor.current = prospectId;
      setDraft(value ?? {});
    }
  }, [prospectId, value]);

  const filled = QUALIFICATION_FIELDS.filter((f) => value?.[f.key]?.trim());

  const save = () => {
    const recruitingQualification = cleanQualification(draft);
    update.mutate(
      { id: prospectId, data: { recruitingQualification } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetProspectQueryKey(prospectId) });
          qc.invalidateQueries({ queryKey: getListProspectsQueryKey() });
          setEditing(false);
          toast({ title: "Qualification saved" });
        },
        onError: (err: any) => toast({ title: "Could not save qualification", description: err?.data?.error || err?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Card data-testid="card-recruiting-qualification">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4 text-primary" /> Employer Qualification</CardTitle>
        {!editing && <Button size="sm" variant="outline" onClick={() => { setDraft(value ?? {}); setEditing(true); }} data-testid="button-edit-qualification">Edit</Button>}
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">Record only what the employer has disclosed. Leave unknown fields blank.</p>
        {editing ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {QUALIFICATION_FIELDS.map((f) => (
                <label key={f.key} className="space-y-1 text-xs font-medium">
                  <span>{f.label}</span>
                  <textarea
                    rows={2}
                    maxLength={2000}
                    value={draft[f.key] ?? ""}
                    placeholder={f.placeholder}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-primary/40"
                    data-testid={`input-qualification-${f.key}`}
                  />
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={update.isPending} data-testid="button-save-qualification">
                {update.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save qualification
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : filled.length ? (
          <dl className="grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2">
            {filled.map((f) => (
              <div key={f.key}>
                <dt className="text-xs font-semibold text-muted-foreground">{f.label}</dt>
                <dd className="whitespace-pre-wrap" data-testid={`text-qualification-${f.key}`}>{value?.[f.key]}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No qualification details captured yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
