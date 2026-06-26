import { Layout } from "@/components/layout";
import { useListCalls } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Phone, Clock, FileText } from "lucide-react";
import { Link } from "wouter";

export default function Calls() {
  const { data: calls, isLoading } = useListCalls();

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Call Log</h2>
          <p className="text-muted-foreground mt-1">History of all prospecting calls and outcomes.</p>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Prospect</TableHead>
                  <TableHead>Status / Outcome</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : calls?.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No calls logged yet.</TableCell></TableRow>
                ) : (
                  calls?.map(call => (
                    <TableRow key={call.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {new Date(call.createdAt).toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link href={`/prospects/${call.prospectId}`} className="text-primary hover:underline text-sm font-medium">
                          View Prospect
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge variant="outline">{call.status.replace(/_/g, " ")}</Badge>
                          {call.outcome && <div className="text-xs font-medium text-primary mt-1">{call.outcome}</div>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {call.duration ? `${Math.floor(call.duration / 60)}m ${call.duration % 60}s` : "—"}
                      </TableCell>
                      <TableCell className="text-sm max-w-[300px] truncate text-muted-foreground">
                        {call.notes ? (
                          <div className="flex items-center gap-2">
                            <FileText className="h-3 w-3 shrink-0" />
                            <span className="truncate">{call.notes}</span>
                          </div>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
