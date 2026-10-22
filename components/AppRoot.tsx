import React from "react";
import { AppProvider, useApp } from "../lib/store";
import { supabaseConfigured } from "../lib/supabase";
import { AuthScreen, OnboardingScreen, PendingScreen, SetupScreen } from "./AuthScreen";
import { Shell } from "./Shell";

function Splash({ text = "Loading ProjectTrack…" }: { text?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="font-display text-2xl tracking-wide text-muted">{text}</p>
    </div>
  );
}

function Gate() {
  const { authReady, session, recovery, profile, profileLoaded, showOnboarding } = useApp();
  if (!authReady) return <Splash />;
  if (!session || recovery) return <AuthScreen />;
  if (!profileLoaded) return <Splash text="Opening your workspace…" />;
  if (!profile || showOnboarding) return <OnboardingScreen />;
  if (!profile.active) return <PendingScreen />;
  return <Shell />;
}

export default function AppRoot() {
  if (!supabaseConfigured) return <SetupScreen />;
  return (
    <AppProvider>
      <Gate />
    </AppProvider>
  );
}
