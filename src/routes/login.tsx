import { useState, type FormEvent } from "react";
import { createFileRoute, Navigate, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { GROK_PROVIDERS, authClient, rememberBearer, signIn } from "@/lib/auth/client";
import { seedDemo } from "@/lib/ops";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { BootScreen } from "@/components/boot";
import { DeckLink } from "@/components/deck-link";
import { Button, Field, TextInput } from "@/components/ui";

export const Route = createFileRoute("/login")({ component: LoginRoute });

function LoginRoute() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <BootScreen label="Sessie nakijken" />;
  return <LoginGate />;
}

function LoginGate() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <BootScreen label="Sessie nakijken" />;
  if (user) return <Navigate to="/" />;
  return <LoginScreen />;
}

const DEMO_EMAIL = "demo@noorderlicht.example";
const DEMO_PASSWORD = "kade-demo-kijken";

function keepToken(ctx: { response: Response }) {
  const token = ctx.response.headers.get("set-auth-token");
  if (token) rememberBearer(token);
}

function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function enterDemo() {
    setBusy(true);
    setError("");
    const fetchOptions = { onSuccess: keepToken };
    const signedIn = await authClient.signIn.email({ email: DEMO_EMAIL, password: DEMO_PASSWORD, fetchOptions });
    const opened = signedIn.error
      ? await authClient.signUp.email({ email: DEMO_EMAIL, password: DEMO_PASSWORD, name: "Demo", fetchOptions })
      : signedIn;
    if (opened.error) {
      setBusy(false);
      setError(opened.error.message || "De demo ging niet open.");
      return;
    }
    try {
      await seedDemo();
    } catch {
      /* Het bureau opent ook als het vullen even hapert. */
    }
    await router.navigate({ to: "/" });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = mode === "up"
      ? await authClient.signUp.email({ email, password, name: name || email, callbackURL: "/" })
      : await authClient.signIn.email({ email, password, callbackURL: "/" });
    setBusy(false);
    if (result.error) {
      setError(result.error.message || "Aanmelden lukte niet.");
      return;
    }
    await router.navigate({ to: "/" });
  }

  return (
    <main className="grid min-h-screen bg-ink text-ivory lg:grid-cols-2">
      <section className="flex flex-col justify-between border-b border-line px-6 py-8 lg:border-r lg:border-b-0 lg:px-12 lg:py-12">
        <p className="text-xs font-medium tracking-widest text-brass uppercase">Zaakterminal</p>
        <div>
          <h1 className="font-display text-6xl leading-none sm:text-8xl">KADE</h1>
          <p className="mt-6 max-w-md text-lg text-mist text-pretty">
            Boeken, facturen, bonnen en een stuurman die de Belgische kalender niet vergeet. Afgeschermd per account.
          </p>
          <div className="mt-8">
            <DeckLink />
          </div>
        </div>
        <p className="mt-10 text-sm text-mist">Antwerpen · IT · dubbele boekhouding</p>
      </section>
      <section className="flex items-center px-6 py-10 lg:px-16">
        <div className="w-full max-w-md">
          <h2 className="font-display text-4xl">{mode === "in" ? "Binnenkomen" : "Account openen"}</h2>
          <p className="mt-2 text-sm text-mist">Demo zonder account, of aanmelden voor je eigen cijfers.</p>
          <div className="mt-6">
            <Button disabled={busy} onClick={() => void enterDemo()}>{busy ? "Demo opent…" : "Demo bekijken"}</Button>
            <p className="mt-2 text-sm text-mist">Geen e-mail, geen wachtwoord. Je komt in het demoboekjaar.</p>
          </div>
          <div className="mt-6 flex flex-col gap-2 border-t border-line pt-6">
            {GROK_PROVIDERS.map((provider) => (
              <Button key={provider.providerId} variant="ghost" onClick={() => signIn(provider.providerId, { callbackURL: "/" })}>
                Doorgaan met {provider.label}
              </Button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3 border-t border-line pt-6">
            {mode === "up" && (
              <Field label="Naam">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </Field>
            )}
            <Field label="E-mail">
              <TextInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </Field>
            <Field label="Wachtwoord">
              <TextInput type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "up" ? "new-password" : "current-password"} />
            </Field>
            {error && <p className="text-sm text-brass">{error}</p>}
            <Button type="submit" disabled={busy}>{busy ? "Bezig…" : mode === "in" ? "Aanmelden" : "Account maken"}</Button>
            <button
              type="button"
              className="min-h-11 text-sm text-mist underline-offset-4 hover:text-ivory hover:underline"
              onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(""); }}
            >
              {mode === "in" ? "Nog geen account" : "Ik heb al een account"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
