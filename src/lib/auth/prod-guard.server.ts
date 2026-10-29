/**
 * Productie mag nooit draaien zonder echte aanmelding of met de gedeelde preview-geheimen.
 * Uitzondering alleen bewust: KADE_ALLOW_INSECURE_AUTH=true (bv. een afgeschermde demo).
 */
export function productionAuthProblems(e: NodeJS.ProcessEnv = process.env): string[] {
  const get = (k: string) => e[k]?.trim() || undefined;
  if (get("NODE_ENV") !== "production" || get("KADE_ALLOW_INSECURE_AUTH") === "true") return [];
  // Sandbox-preview (geen GROK_PROJECT_ID) is geen productie.
  if (!get("GROK_PROJECT_ID") && !get("DATABASE_URL")) return [];
  const out: string[] = [];
  if (get("VITE_AUTH_ENABLED") === "false") out.push("VITE_AUTH_ENABLED=false in productie: aanmelden staat uit.");
  if (!get("GROK_AUTH_CLIENT_ID") || !get("GROK_AUTH_CLIENT_SECRET")) out.push("GROK_AUTH_CLIENT_ID/SECRET ontbreken: de gedeelde preview-client zou gebruikt worden.");
  if (!get("BETTER_AUTH_SECRET")) out.push("BETTER_AUTH_SECRET ontbreekt: sessies zouden met een tijdelijk preview-geheim ondertekend worden.");
  return out;
}

export function assertProductionAuth(): void {
  const problems = productionAuthProblems();
  if (problems.length) throw new Error(`[auth] Onveilige productieconfiguratie, Kade weigert te starten: ${problems.join(" ")}`);
}
