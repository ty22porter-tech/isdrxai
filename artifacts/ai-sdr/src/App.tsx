import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import Prospects from "@/pages/prospects";
import ProspectDetail from "@/pages/prospect-detail";
import Campaigns from "@/pages/campaigns";
import Appointments from "@/pages/appointments";
import Emails from "@/pages/emails";
import Calls from "@/pages/calls";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/prospects" component={Prospects} />
      <Route path="/prospects/:id" component={ProspectDetail} />
      <Route path="/campaigns" component={Campaigns} />
      <Route path="/appointments" component={Appointments} />
      <Route path="/emails" component={Emails} />
      <Route path="/calls" component={Calls} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
