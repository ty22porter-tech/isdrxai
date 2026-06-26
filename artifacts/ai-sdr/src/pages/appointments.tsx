import { Layout } from "@/components/layout";
import { useListAppointments } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar as CalendarIcon, Clock } from "lucide-react";
import { Link } from "wouter";

export default function Appointments() {
  const { data: appointments, isLoading } = useListAppointments();

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Walkthroughs & Demos</h2>
          <p className="text-muted-foreground mt-1">Your upcoming commercial cleaning proposals and walkthroughs.</p>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Prospect</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : appointments?.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No appointments scheduled.</TableCell></TableRow>
                ) : (
                  appointments?.map(apt => {
                    const date = new Date(apt.scheduledAt);
                    return (
                      <TableRow key={apt.id}>
                        <TableCell>
                          <div className="font-medium flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                            {date.toLocaleDateString()}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                            <Clock className="h-3 w-3" />
                            {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </TableCell>
                        <TableCell className="capitalize">{apt.type.replace(/_/g, " ")}</TableCell>
                        <TableCell>
                          <Link href={`/prospects/${apt.prospectId}`} className="font-medium hover:underline text-primary">
                            View Prospect
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3" /> {apt.location || "TBD"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={apt.status === 'scheduled' ? 'default' : 'secondary'}>
                            {apt.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
