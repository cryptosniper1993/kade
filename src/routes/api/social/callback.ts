import { createFileRoute } from "@tanstack/react-router";
import { handleSocialCallback } from "@/lib/social-callback.server";

export const Route = createFileRoute("/api/social/callback")({
  server: { handlers: { GET: ({ request }) => handleSocialCallback(request) } },
});
