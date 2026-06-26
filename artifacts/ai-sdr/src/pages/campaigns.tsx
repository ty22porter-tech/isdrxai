import { Layout } from "@/components/layout";
import { useListCampaigns, useCreateCampaign } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";

export default function Campaigns() {
  const { data: campaigns, isLoading, refetch } = useListCampaigns();
  const createCampaign = useCreateCampaign();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    type: "email",
    targetIndustry: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createCampaign.mutate({ data: formData }, {
      onSuccess: () => {
        toast({ title: "Campaign created" });
        setIsOpen(false);
        refetch();
        setFormData({ name: "", type: "email", targetIndustry: "" });
      }
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Campaigns</h2>
            <p className="text-muted-foreground mt-1">Manage outreach campaigns and automated sequences.</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> New Campaign</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Campaign</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Campaign Name</label>
                  <Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Medical Offices Q3" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Target Industry</label>
                  <Input required value={formData.targetIndustry} onChange={e => setFormData({...formData, targetIndustry: e.target.value})} placeholder="e.g. Healthcare" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Type</label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={formData.type} 
                    onChange={e => setFormData({...formData, type: e.target.value})}
                  >
                    <option value="email">Email Sequence</option>
                    <option value="call">Call Blitz</option>
                    <option value="mixed">Mixed Touchpoints</option>
                  </select>
                </div>
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createCampaign.isPending}>Create</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Target Industry</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Appointments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : campaigns?.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No campaigns found.</TableCell></TableRow>
                ) : (
                  campaigns?.map(campaign => (
                    <TableRow key={campaign.id}>
                      <TableCell className="font-medium">{campaign.name}</TableCell>
                      <TableCell className="capitalize">{campaign.type}</TableCell>
                      <TableCell>
                        <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'}>
                          {campaign.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{campaign.targetIndustry}</TableCell>
                      <TableCell className="text-right">{campaign.emailsSent}</TableCell>
                      <TableCell className="text-right font-bold text-primary">{campaign.appointmentsSet}</TableCell>
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
