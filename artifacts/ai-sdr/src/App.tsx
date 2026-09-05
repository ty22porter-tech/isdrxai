import { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/lib/queryClient";

import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Prospects from "@/pages/prospects";
import ProspectDetail from "@/pages/prospect-detail";
import Campaigns from "@/pages/campaigns";
import Appointments from "@/pages/appointments";
import Emails from "@/pages/emails";
import Calls from "@/pages/calls";
import Prospecting from "@/pages/prospecting";
import Sequences from "@/pages/sequences";
import Billing from "@/pages/billing";
import Pricing from "@/pages/pricing";
import Admin from "@/pages/admin";
import Home from "@/pages/home";
import Settings from "@/pages/settings";
import Autopilot from "@/pages/autopilot";
import Schedule from "@/pages/schedule";
import Unsubscribe from "@/pages/unsubscribe";
import Caller from "@/pages/caller";
import Leadership from "@/pages/leadership";
import AdminLeadership from "@/pages/admin-leadership";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  baseTheme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#234d73",
    colorForeground: "#172b3a",
    colorMutedForeground: "#65727a",
    colorDanger: "#c74b45",
    colorBackground: "#f7f3e9",
    colorInput: "#fffdfa",
    colorInputForeground: "#172b3a",
    colorNeutral: "#d8d6cf",
    fontFamily: "DM Sans, sans-serif",
    borderRadius: "0.65rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#fffdfa] border border-[#d8d6cf] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#172b3a] font-bold",
    headerSubtitle: "text-[#65727a]",
    socialButtonsBlockButtonText: "text-[#243540]",
    formFieldLabel: "text-[#43545e]",
    footerActionLink: "text-[#234d73] hover:text-[#183b59]",
    footerActionText: "text-[#65727a]",
    dividerText: "text-[#748087]",
    identityPreviewEditButton: "text-[#234d73]",
    formFieldSuccessText: "text-[#2d587f]",
    alertText: "text-[#b33e38]",
    logoBox: "flex justify-center",
    logoImage: "h-10 w-auto",
    socialButtonsBlockButton: "border-[#d8d6cf] bg-[#fffdfa] hover:bg-[#eef2f3]",
    formButtonPrimary: "bg-[#234d73] hover:bg-[#183b59] text-white font-semibold",
    formFieldInput: "bg-[#fffdfa] border-[#d8d6cf] text-[#172b3a]",
    footerAction: "border-t border-[#dfdcd5]",
    dividerLine: "bg-[#dfdcd5]",
    alert: "bg-[#fff0ed] border border-[#e3aaa3]",
    otpCodeFieldInput: "bg-[#fffdfa] border-[#d8d6cf] text-[#172b3a]",
    formFieldRow: "",
    main: "",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f7f3e9] px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        fallbackRedirectUrl={`${basePath}/dashboard`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f7f3e9] px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        fallbackRedirectUrl={`${basePath}/dashboard`}
      />
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <Component />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function FallbackRoute() {
  const [location] = useLocation();

  const normalized = location.replace(/\/+$/, "") || "/";
  if (normalized !== location) {
    return <Redirect to={normalized} replace />;
  }

  if (/^\/(sso-callback|sign-in|sign-up|v\/)/.test(location)) {
    return (
      <>
        <Show when="signed-in">
          <Redirect to="/dashboard" replace />
        </Show>
        <Show when="signed-out">
          <Redirect to="/" replace />
        </Show>
      </>
    );
  }

  return <NotFound />;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function AppRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={`${basePath}/dashboard`}
      signUpFallbackRedirectUrl={`${basePath}/dashboard`}
      localization={{
        signIn: { start: { title: "Welcome back", subtitle: "Sign in to your iSDRX AI account" } },
        signUp: { start: { title: "Get started", subtitle: "Create your iSDRX AI account" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/schedule/:token" component={Schedule} />
            <Route path="/unsubscribe/:token" component={Unsubscribe} />
            <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
            <Route path="/overview" component={() => <ProtectedRoute component={() => <Redirect to="/dashboard" />} />} />
            <Route path="/leadership" component={() => <ProtectedRoute component={Leadership} />} />
            <Route path="/admin/leadership" component={() => <ProtectedRoute component={AdminLeadership} />} />
            <Route path="/prospects" component={() => <ProtectedRoute component={Prospects} />} />
            <Route path="/prospects/:id" component={() => <ProtectedRoute component={ProspectDetail} />} />
            <Route path="/campaigns" component={() => <ProtectedRoute component={Campaigns} />} />
            <Route path="/appointments" component={() => <ProtectedRoute component={Appointments} />} />
            <Route path="/emails" component={() => <ProtectedRoute component={Emails} />} />
            <Route path="/calls" component={() => <ProtectedRoute component={Calls} />} />
            <Route path="/prospecting" component={() => <ProtectedRoute component={Prospecting} />} />
            <Route path="/sequences" component={() => <ProtectedRoute component={Sequences} />} />
            <Route path="/billing" component={() => <ProtectedRoute component={Billing} />} />
            <Route path="/pricing" component={() => <ProtectedRoute component={Pricing} />} />
            <Route path="/admin" component={() => <ProtectedRoute component={Admin} />} />
            <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
            <Route path="/autopilot" component={() => <ProtectedRoute component={Autopilot} />} />
            <Route path="/caller" component={() => <ProtectedRoute component={Caller} />} />
            <Route component={FallbackRoute} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <AppRoutes />
    </WouterRouter>
  );
}

export default App;
