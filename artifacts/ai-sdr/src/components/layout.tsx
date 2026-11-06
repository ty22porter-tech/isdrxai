import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  BarChart3,
  Users,
  Mail,
  PhoneCall,
  Calendar,
  Send,
  Building2,
  Telescope,
  GitBranch,
  CreditCard,
  Shield,
  LogOut,
  Bot,
  Settings,
  Menu,
  X,
  Bell,
  Flame,
  Headset,
  TrendingUp,
  BarChart,
  Gift,
  BookOpen,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";

interface LayoutProps {
  children: ReactNode;
}

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

const navigation = [
  { name: "Overview", href: "/dashboard", icon: BarChart3 },
  { name: "Leadership", href: "/leadership", icon: TrendingUp },
  { name: "Autopilot", href: "/autopilot", icon: Bot },
  { name: "Prospect Search", href: "/prospecting", icon: Telescope },
  { name: "Prospects", href: "/prospects", icon: Users },
  { name: "Campaigns", href: "/campaigns", icon: Send },
  { name: "Gift Outreach", href: "/gift-outreach", icon: Gift },
  { name: "Sequences", href: "/sequences", icon: GitBranch },
  { name: "Emails", href: "/emails", icon: Mail },
  { name: "Calls", href: "/calls", icon: PhoneCall },
  { name: "Appointments", href: "/appointments", icon: Calendar },
  { name: "Caller Workspace", href: "/caller", icon: Headset },
  { name: "Billing", href: "/billing", icon: CreditCard },
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "Help & Training", href: "/help", icon: BookOpen },
];

async function apiFetch(path: string) {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

function NotificationBell() {
  const queryClient = useQueryClient();
  const { data } = useQuery<{ unread: number; notifications: Array<{ id: number; type: string; title: string; body: string; prospectId: number | null; readAt: string | null; createdAt: string }> }>({
    queryKey: ["notifications"],
    queryFn: () => apiFetch("/notifications"),
    refetchInterval: 60_000,
  });
  const unread = data?.unread ?? 0;
  const items = data?.notifications ?? [];

  const markAllRead = async () => {
    await fetch(`/api/notifications/read-all`, { method: "POST", credentials: "include" });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
  const markRead = async (id: number) => {
    await fetch(`/api/notifications/${id}/read`, { method: "POST", credentials: "include" });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary hover:underline">Mark all read</button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : items.map(n => (
            <Link
              key={n.id}
              href={n.prospectId ? `/prospects/${n.prospectId}` : "/prospects"}
              onClick={() => { if (!n.readAt) markRead(n.id); }}
            >
              <div className={cn("px-3 py-2.5 border-b last:border-b-0 cursor-pointer hover:bg-muted/50", !n.readAt && "bg-primary/5")}>
                <div className="flex items-start gap-2">
                  {n.type === "hot_prospect" ? <Flame className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" /> : <Bell className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <p className={cn("text-sm leading-snug", !n.readAt && "font-semibold")}>{n.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function VerticalOnboardingDialog({ open }: { open: boolean }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (vertical: "janitorial" | "it_services" | "fleet_wraps" | "recruiting_staffing") => {
    setSaving(vertical);
    setError(null);
    try {
      const res = await fetch(`/api/users/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ vertical }),
      });
      if (!res.ok) throw new Error("Failed to save");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch {
      setError("We couldn't save your choice. Please check your connection and try again.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-2xl [&>button]:hidden" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>What kind of business do you run?</DialogTitle>
          <DialogDescription>
            This tailors your outreach emails, industry pitches, and scheduling questionnaire. You can change it later in Settings.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          <button
            onClick={() => choose("janitorial")}
            disabled={saving !== null}
            className="rounded-lg border p-4 text-left hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-60"
          >
            <div className="font-semibold">Commercial Cleaning / Janitorial</div>
            <div className="text-sm text-muted-foreground mt-1">Book walkthroughs and win cleaning contracts.</div>
          </button>
          <button
            onClick={() => choose("it_services")}
            disabled={saving !== null}
            className="rounded-lg border p-4 text-left hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-60"
          >
            <div className="font-semibold">IT Services / MSP</div>
            <div className="text-sm text-muted-foreground mt-1">Book free IT assessments — cybersecurity, MS365, managed IT, managed security, MDM.</div>
          </button>
          <button
            onClick={() => choose("fleet_wraps")}
            disabled={saving !== null}
            className="rounded-lg border p-4 text-left hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-60"
          >
            <div className="font-semibold">Fleet & Commercial Vehicle Wraps</div>
            <div className="text-sm text-muted-foreground mt-1">Find fleet-dependent businesses and sell vehicle wraps, graphics, and lettering.</div>
          </button>
          <button
            onClick={() => choose("recruiting_staffing")}
            disabled={saving !== null}
            className="rounded-lg border p-4 text-left hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-60"
            data-testid="button-choose-recruiting"
          >
            <div className="font-semibold">Recruiting & Staffing</div>
            <div className="text-sm text-muted-foreground mt-1">Find employers with verified hiring and growth signals and book hiring-needs discovery calls.</div>
          </button>
          {error && (
            <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error} Select an option to retry.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const { data: meData } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch("/users/me"),
    enabled: !!user,
  });

  const needsVerticalChoice = meData ? meData.verticalSelected === false : false;

  const isAdmin = meData?.isAdmin === true;

  const allNavigation = isAdmin
    ? [
        ...navigation,
        { name: "Admin", href: "/admin", icon: Shield },
        { name: "Platform Leadership", href: "/admin/leadership", icon: BarChart },
      ]
    : navigation;

  const currentPage = allNavigation.find(
    n => location === n.href || (n.href !== "/dashboard" && location.startsWith(n.href))
  );

  const initials = user?.firstName
    ? (user.firstName[0] + (user.lastName?.[0] ?? "")).toUpperCase()
    : user?.primaryEmailAddress?.emailAddress?.slice(0, 2).toUpperCase() ?? "?";

  const displayName = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "User";

  const navLinks = (
    <nav className="px-3 space-y-1">
      {allNavigation.map((item) => {
        const isActive = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href));
        return (
          <Link key={item.name} href={item.href} className="block" onClick={() => setMobileNavOpen(false)}>
            <span
              className={cn(
                "flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-[background-color,color] duration-200",
                isActive
                   ? "bg-primary/10 text-primary shadow-[inset_3px_0_0_hsl(var(--primary))]"
                   : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              )}
            >
              <item.icon
                className={cn(
                  "mr-3 flex-shrink-0 h-5 w-5",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
                aria-hidden="true"
              />
              {item.name}
            </span>
          </Link>
        );
      })}
    </nav>
  );

  const userFooter = (
    <div className="p-4 border-t border-border space-y-3">
      {meData?.status === "suspended" && (
        <Link href="/billing" onClick={() => setMobileNavOpen(false)}>
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2 cursor-pointer hover:bg-red-900/30 transition-colors">
            <CreditCard className="w-3.5 h-3.5 shrink-0" />
            <span>Account suspended — <strong>update billing</strong></span>
          </div>
        </Link>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center min-w-0">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0">
            {initials}
          </div>
          <div className="ml-3 min-w-0">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground capitalize">{meData?.status ?? "active"}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
          onClick={() => signOut({ redirectUrl: `${BASE_URL}/` })}
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
      <div className="dashboard-theme min-h-[100dvh] bg-background flex flex-col md:flex-row">
      <VerticalOnboardingDialog open={needsVerticalChoice} />

      {/* Desktop sidebar */}
      <div className="hidden md:flex h-[100dvh] w-[228px] border-r border-sidebar-border bg-sidebar flex-col sticky top-0">
        <div className="h-[68px] flex items-center px-5 border-b border-sidebar-border">
          <div className="h-8 w-8 rounded-[9px] bg-primary flex items-center justify-center mr-3 shadow-[0_3px_8px_hsl(210_52%_32%_/_0.2)]">
            <Building2 className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">iSDRX <span className="text-primary">AI</span><span className="ml-2 font-mono text-[9px] uppercase tracking-[.14em] text-muted-foreground">workspace</span></span>
        </div>
        <div className="sidebar-scroll min-h-0 flex-1 overflow-y-scroll py-4">
          {navLinks}
        </div>
        {userFooter}
      </div>

      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-30 h-14 border-b bg-sidebar flex items-center justify-between px-4">
        <div className="flex items-center">
          <Building2 className="h-5 w-5 text-primary mr-2" />
          <span className="font-semibold tracking-tight">iSDRX AI</span>
        </div>
        <div className="flex items-center gap-1">
        <NotificationBell />
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => setMobileNavOpen(o => !o)}
          aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
        >
          {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 top-14 z-20 flex flex-col bg-card overflow-y-auto">
          <div className="flex-1 py-4">
            {navLinks}
          </div>
          {userFooter}
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="hidden md:flex h-[68px] border-b bg-sidebar items-center justify-between px-8 sticky top-0 z-10">
          <h1 className="text-[15px] font-semibold tracking-tight">
            {currentPage?.name ?? "iSDRX AI"}
          </h1>
          <NotificationBell />
        </header>

        <main className="flex-1 p-4 md:px-8 md:py-7 overflow-y-auto bg-background">
          <div className="max-w-[1380px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
