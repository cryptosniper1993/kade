import { createFileRoute } from "@tanstack/react-router";
import { handleBotApi } from "@/lib/bot-api.server";

export const Route = createFileRoute("/api/bot/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => handleBotApi(request, params._splat ?? ""),
      POST: ({ request, params }) => handleBotApi(request, params._splat ?? ""),
    },
  },
});
