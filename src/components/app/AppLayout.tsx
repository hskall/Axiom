import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { SpotlightProvider, useSpotlight } from "@/components/spotlight/SpotlightProvider";
import { onboardingTour } from "@/lib/levels";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const TourBootstrap = () => {
  const { user } = useAuth();
  const { start } = useSpotlight();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data && !data.onboarding_completed) {
        // small delay so the dashboard mounts and spotlight selectors exist
        setTimeout(() => {
          start(onboardingTour, async () => {
            await supabase
              .from("profiles")
              .update({ onboarding_completed: true })
              .eq("id", user.id);
          });
        }, 600);
      }
    })();
    return () => { cancelled = true; };
  }, [user, start]);

  return null;
};

const AppLayout = () => {
  return (
    <SpotlightProvider>
      <TourBootstrap />
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-12 flex items-center gap-2 border-b border-border bg-background/80 backdrop-blur sticky top-0 z-10 px-3">
              <SidebarTrigger />
              <div className="flex-1" />
            </header>
            <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
              <Outlet />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </SpotlightProvider>
  );
};

export default AppLayout;
