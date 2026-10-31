import { createFileRoute } from "@tanstack/react-router";

import { ThreadGrid } from "../components/grid/ThreadGrid";

export const Route = createFileRoute("/_chat/grid")({
  component: ThreadGrid,
});
