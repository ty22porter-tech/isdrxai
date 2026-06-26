import { Layout } from "@/components/layout";
import { useListEmails } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Mail, Clock, Eye, Reply } from "lucide-react";
import { Link } from "wouter";

export default function Emails() {
  const { data: emails, isLoading } = useListEmails();

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Email Log</h2>
          <p className="text-muted-foreground mt-1">History of all AI-generated outreach emails sent.</p>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Prospect</TableHead>
                  <TableHead>Sent At</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Engagement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : emails?.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No emails sent yet.</TableCell></TableRow>
                ) : (
                  emails?.map(email => (
                    <TableRow key={email.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          {email.subject}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link href={`/prospects/${email.prospectId}`} className="text-primary hover:underline text-sm font-medium">
                          View Prospect
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(email.sentAt).toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={email.status === 'sent' ? 'default' : 'outline'}>
                          {email.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          {email.openedAt && <div className="flex items-center gap-1 text-blue-600"><Eye className="h-3 w-3" /> Opened</div>}
                          {email.repliedAt && <div className="flex items-center gap-1 text-green-600"><Reply className="h-3 w-3" /> Replied</div>}
                          {!email.openedAt && !email.repliedAt && "—"}
                        </div>
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
