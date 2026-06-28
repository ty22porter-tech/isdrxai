import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";

interface LayoutProps {
  children: ReactNode;
}

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: BarChart3 },
  { name: "Autopilot", href: "/autopilot", icon: Bot },
  { name: "Prospect Search", href: "/prospecting", icon: Telescope },
  { name: "Prospects", href: "/prospects", icon: Users },
  { name: "Campaigns", href: "/campaigns", icon: Send },
  { name: "Sequences", href: "/sequences", icon: GitBranch },
  { name: "Emails", href: "/emails", icon: Mail },
  { name: "Calls", href: "/calls", icon: PhoneCall },
  { name: "Appointments", href: "/appointments", icon: Calendar },
  { name: "Billing", href: "/billing", icon: CreditCard },
  { name: "Settings", href: "/settings", icon: Settings },
];

async function apiFetch(path: string) {
  const res = await fetch(`${BASE_URL}/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();

  const { data: meData } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch("/users/me"),
    enabled: !!user,
  });

  const isAdmin = meData?.isAdmin === true;

  const allNavigation = isAdmin
    ? [...navigation, { name: "Admin", href: "/admin", icon: Shield }]
    : navigation;

  const currentPage = allNavigation.find(
    n => location === n.href || (n.href !== "/dashboard" && location.startsWith(n.href))
  );

  const initials = user?.firstName
    ? (user.firstName[0] + (user.lastName?.[0] ?? "")).toUpperCase()
    : user?.primaryEmailAddress?.emailAddress?.slice(0, 2).toUpperCase() ?? "?";

  const displayName = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "User";

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <div className="w-full md:w-64 border-r bg-card flex flex-col h-screen sticky top-0">
        <div className="h-16 flex items-center px-6 border-b">
          <Building2 className="h-6 w-6 text-primary mr-3" />
          <span className="font-semibold text-lg tracking-tight">AI SDR</span>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="px-3 space-y-1">
            {allNavigation.map((item) => {
              const isActive = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href));
              return (
                <Link key={item.name} href={item.href} className="block">
                  <span
                    className={cn(
                      "flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
        </div>
        <div className="p-4 border-t border-border space-y-3">
          {meData?.status === "suspended" && (
            <Link href="/billing">
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
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-card flex items-center justify-between px-8 sticky top-0 z-10">
          <h1 className="text-lg font-semibold">
            {currentPage?.name ?? "AI SDR"}
          </h1>
        </header>

        <main className="flex-1 p-8 overflow-y-auto bg-background">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
