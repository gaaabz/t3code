import { createContext } from "react";

import type { ThreadGridDraft } from "../../threadGridStore";

/** Set inside a grid draft tile: a draft that changes project replaces the tile's draft instead of navigating. */
export const GridDraftTileContext = createContext<((draft: ThreadGridDraft) => void) | null>(null);
