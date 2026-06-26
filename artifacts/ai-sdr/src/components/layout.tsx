import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { 
  BarChart3, 
  Users, 
  Mail, 
  PhoneCall, 
  Calendar, 
  Send,
  Building2,
  Bell,
  Telescope
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface LayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: "Dashboard", href: "/", icon: BarChart3 },
  { name: "Prospect Search", href: "/prospecting", icon: Telescope },
  { name: "Prospects", href: "/prospects", icon: Users },
  { name: "Campaigns", href: "/campaigns", icon: Send },
  { name: "Emails", href: "/emails", icon: Mail },
  { name: "Calls", href: "/calls", icon: PhoneCall },
  { name: "Appointments", href: "/appointments", icon: Calendar },
];

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <div className="w-full md:w-64 border-r bg-card flex flex-col h-screen sticky top-0">
        <div className="h-16 flex items-center px-6 border-b">
          <Building2 className="h-6 w-6 text-primary mr-3" />
          <span className="font-semibold text-lg tracking-tight">AI SDR</span>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="px-3 space-y-1">
            {navigation.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
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
        <div className="p-4 border-t border-border">
          <div className="flex items-center">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
              JD
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">John Doe</p>
              <p className="text-xs text-muted-foreground">SDR Agent</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-card flex items-center justify-between px-8 sticky top-0 z-10">
          <h1 className="text-lg font-semibold">
            {navigation.find(n => location === n.href || (n.href !== "/" && location.startsWith(n.href)))?.name || "AI SDR"}
          </h1>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="rounded-full">
              <Bell className="h-5 w-5 text-muted-foreground" />
            </Button>
          </div>
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
