import "@excalidraw/excalidraw/index.css";

import { Excalidraw, exportToSvg, restore } from "@excalidraw/excalidraw";
import type { ThemeAppearance } from "@t3tools/shared/themePalettes";
import { Maximize2Icon, XIcon } from "lucide-react";
import { use, useRef, useState } from "react";

import { Button } from "../ui/button";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

type Scene = ReturnType<typeof restore>;
type Drawing =
  | {
      readonly status: "ready";
      readonly scene: Scene;
      readonly thumbnail: string;
      readonly width: number;
      readonly height: number;
    }
  | { readonly status: "empty" }
  | { readonly status: "invalid" };

const MAX_CACHED_DRAWINGS = 8;
// Suspending discards component state, so the pending render must live outside it.
const drawings = new Map<string, Promise<Drawing>>();

function loadDrawing(text: string, theme: ThemeAppearance): Promise<Drawing> {
  const key = `${theme}:${text}`;
  const cached = drawings.get(key);
  if (cached) return cached;
  const load = renderDrawing(text, theme);
  drawings.set(key, load);
  const oldest = drawings.keys().next();
  if (drawings.size > MAX_CACHED_DRAWINGS && !oldest.done) drawings.delete(oldest.value);
  return load;
}

async function renderDrawing(text: string, theme: ThemeAppearance): Promise<Drawing> {
  let scene: Scene;
  try {
    const data: Parameters<typeof restore>[0] & { type?: unknown } = JSON.parse(text);
    if (data?.type !== "excalidraw" || !Array.isArray(data.elements)) return { status: "invalid" };
    scene = restore(data, null, null);
  } catch {
    return { status: "invalid" };
  }
  const elements = scene.elements.filter((element) => !element.isDeleted);
  if (elements.length === 0) return { status: "empty" };
  const svg = await exportToSvg({
    elements,
    files: scene.files,
    appState: { ...scene.appState, exportBackground: true, exportWithDarkMode: theme === "dark" },
    exportPadding: 16,
    renderEmbeddables: false,
  });
  // As an <img>, the drawing cannot run script or fetch resources; its fonts are inlined.
  const thumbnail = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`;
  return {
    status: "ready",
    scene: { ...scene, elements },
    thumbnail,
    width: Number(svg.getAttribute("width")) || 800,
    height: Number(svg.getAttribute("height")) || 600,
  };
}

export default function ExcalidrawViewer(props: {
  readonly text: string;
  readonly name: string;
  readonly theme: ThemeAppearance;
}) {
  const drawing = use(loadDrawing(props.text, props.theme));
  const [expanded, setExpanded] = useState(false);
  if (drawing.status !== "ready") {
    return (
      <div role="alert" className="p-6 text-xs text-muted-foreground">
        {drawing.status === "empty"
          ? "This drawing is empty."
          : "This file is not a valid Excalidraw drawing. Show Excalidraw source to inspect it."}
      </div>
    );
  }
  return (
    <div className="scrollbar-gutter-both min-h-0 flex-1 overflow-auto p-6">
      <div className="group/excalidraw relative mx-auto w-fit max-w-full">
        <button
          type="button"
          aria-label={`Open ${props.name} full screen`}
          className="block max-w-full cursor-zoom-in overflow-hidden rounded-lg ring-1 ring-border/70"
          onClick={() => setExpanded(true)}
        >
          <img
            src={drawing.thumbnail}
            alt={props.name}
            draggable={false}
            className="block h-auto max-h-[70vh] w-auto max-w-full object-contain"
          />
        </button>
        <div className="absolute end-2 top-2 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/excalidraw:opacity-100 pointer-coarse:opacity-100">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Open full screen"
                  size="icon-xs"
                  variant="glass"
                  onClick={() => setExpanded(true)}
                />
              }
            >
              <Maximize2Icon className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup side="left">Open full screen</TooltipPopup>
          </Tooltip>
        </div>
      </div>
      {expanded ? (
        <ExcalidrawDialog
          scene={drawing.scene}
          name={props.name}
          theme={props.theme}
          onClose={() => setExpanded(false)}
        />
      ) : null}
    </div>
  );
}

/** Fills its container, as the floating preview over chat; clicking opens it full screen. */
export function ExcalidrawFloatingDrawing(props: {
  readonly text: string;
  readonly name: string;
  readonly theme: ThemeAppearance;
  readonly onSize: (size: { readonly width: number; readonly height: number }) => void;
}) {
  const drawing = use(loadDrawing(props.text, props.theme));
  const [expanded, setExpanded] = useState(false);
  if (drawing.status !== "ready") {
    return (
      <div
        role="alert"
        className="flex size-full items-center justify-center p-4 text-center text-xs text-muted-foreground"
      >
        {drawing.status === "empty"
          ? "This drawing is empty."
          : "This file is not a valid Excalidraw drawing."}
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        aria-label={`Open ${props.name} full screen`}
        className="block size-full cursor-zoom-in"
        onClick={() => setExpanded(true)}
      >
        <img
          ref={() => props.onSize({ width: drawing.width, height: drawing.height })}
          src={drawing.thumbnail}
          alt={props.name}
          draggable={false}
          className="block size-full object-contain"
        />
      </button>
      {expanded ? (
        <ExcalidrawDialog
          scene={drawing.scene}
          name={props.name}
          theme={props.theme}
          onClose={() => setExpanded(false)}
        />
      ) : null}
    </>
  );
}

function ExcalidrawDialog(props: {
  readonly scene: Scene;
  readonly name: string;
  readonly theme: ThemeAppearance;
  readonly onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { scene } = props;
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogPopup
        variant="media"
        showCloseButton={false}
        bottomStickOnMobile={false}
        className="row-start-1"
        initialFocus={closeButtonRef}
      >
        <DialogTitle className="sr-only">Expanded {props.name} drawing</DialogTitle>
        <div className="relative w-[92vw]">
          <Button
            ref={closeButtonRef}
            aria-label="Close"
            size="icon-xs"
            variant="media-close"
            className="absolute right-0 -top-10 z-20"
            onClick={props.onClose}
          >
            <XIcon />
          </Button>
          <div className="h-[min(86vh,calc(100vh-160px))] overflow-hidden rounded-lg shadow-2xl ring-1 ring-border/70">
            <Excalidraw
              initialData={{
                elements: scene.elements,
                files: scene.files,
                appState: { viewBackgroundColor: scene.appState.viewBackgroundColor },
                scrollToContent: true,
              }}
              name={props.name}
              theme={props.theme}
              viewModeEnabled
              zenModeEnabled
              validateEmbeddable={false}
              renderEmbeddable={() => null}
              UIOptions={{
                canvasActions: {
                  changeViewBackgroundColor: false,
                  clearCanvas: false,
                  export: false,
                  loadScene: false,
                  saveAsImage: false,
                  saveToActiveFile: false,
                  toggleTheme: false,
                },
              }}
            />
          </div>
          <div className="mt-2 truncate text-center text-xs text-white/80">{props.name}</div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
