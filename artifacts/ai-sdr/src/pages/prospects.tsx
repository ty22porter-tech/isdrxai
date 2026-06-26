import { useState } from "react";
import { useListProspects, useCreateProspect } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, Plus, Building2, MapPin, Phone, Mail } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function Prospects() {
  const [search, setSearch] = useState("");
  const { data: prospects, isLoading, refetch } = useListProspects({ search });
  const createProspect = useCreateProspect();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const [formData, setFormData] = useState({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    industry: "",
    city: "",
    state: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createProspect.mutate({ data: formData }, {
      onSuccess: () => {
        toast({ title: "Prospect created" });
        setIsOpen(false);
        refetch();
        setFormData({ companyName: "", contactName: "", email: "", phone: "", industry: "", city: "", state: "" });
      }
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "new": return "bg-blue-100 text-blue-800";
      case "contacted": return "bg-yellow-100 text-yellow-800";
      case "interested": return "bg-orange-100 text-orange-800";
      case "qualified": return "bg-purple-100 text-purple-800";
      case "appointment_set": return "bg-green-100 text-green-800";
      case "closed_won": return "bg-emerald-100 text-emerald-800";
      case "closed_lost": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Prospects</h2>
            <p className="text-muted-foreground mt-1">Manage your janitorial commercial targets.</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Add Prospect</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add New Prospect</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Company Name</label>
                    <Input required value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Contact Name</label>
                    <Input required value={formData.contactName} onChange={e => setFormData({...formData, contactName: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <Input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Phone</label>
                    <Input required value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Industry</label>
                    <Input required value={formData.industry} onChange={e => setFormData({...formData, industry: e.target.value})} placeholder="e.g. Office, Medical" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">City</label>
                      <Input required value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">State</label>
                      <Input required value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createProspect.isPending}>Save Prospect</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader className="py-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search prospects..." 
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Contacted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : prospects?.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No prospects found.</TableCell></TableRow>
                ) : (
                  prospects?.map(prospect => (
                    <TableRow key={prospect.id}>
                      <TableCell>
                        <Link href={`/prospects/${prospect.id}`} className="font-medium hover:underline text-primary">
                          {prospect.companyName}
                        </Link>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> {prospect.industry}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{prospect.contactName}</div>
                        <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                          <div className="flex items-center gap-1"><Mail className="h-3 w-3" /> {prospect.email}</div>
                          <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {prospect.phone}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          {prospect.city}, {prospect.state}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusColor(prospect.status)}>
                          {prospect.status.replace(/_/g, " ").toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {prospect.lastContactedAt ? new Date(prospect.lastContactedAt).toLocaleDateString() : "Never"}
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
