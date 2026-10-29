import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { BootScreen } from "@/components/boot";
import { Terminal } from "@/components/terminal";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <BootScreen />;
  return <Gate />;
}

function Gate() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <BootScreen />;
  if (!user) return <RedirectToSignIn />;
  return <Terminal user={user} />;
}
