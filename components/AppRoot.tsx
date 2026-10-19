import React from "react";
import { AppProvider, useApp } from "../lib/store";
import { supabaseConfigured } from "../lib/supabase";
import { AuthScreen, PendingScreen, SetupScreen } from "./AuthScreen";
import { Shell } from "./Shell";
import { Button } from "./ui";

function Splash({ text = "Loading ProjectTrack…" }: { text?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="font-display text-2xl tracking-wide text-muted">{text}</p>
    </div>
  );
}

function Gate() {
  const { authReady, session, recovery, profile, profileLoaded, signOut } = useApp();
  if (!authReady) return <Splash />;
  if (!session || recovery) return <AuthScreen />;
  if (!profileLoaded) return <Splash text="Opening your workspace…" />;
  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-display text-3xl font-semibold tracking-wide">Your profile could not be loaded</h1>
        <p className="max-w-md text-sm text-muted">Check that the database migration has been applied, then sign in again.</p>
        <Button onClick={() => signOut()}>Sign out</Button>
      </div>
    );
  }
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
