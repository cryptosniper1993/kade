import { createFileRoute } from "@tanstack/react-router";
import { handleMailCallback } from "@/lib/mail-callback.server";

export const Route = createFileRoute("/api/mail/callback")({
  server: { handlers: { GET: ({ request }) => handleMailCallback(request) } },
});
