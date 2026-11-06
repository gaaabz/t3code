import type { ThemeAppearance } from "@t3tools/shared/themePalettes";
import { lazy, Suspense } from "react";

import { FileSurfaceLoading } from "./fileSurfaceChrome";

const ExcalidrawViewer = lazy(() => import("./ExcalidrawViewer"));
export const ExcalidrawFloatingDrawing = lazy(() =>
  import("./ExcalidrawViewer").then((module) => ({ default: module.ExcalidrawFloatingDrawing })),
);

export const isExcalidrawPreviewFile = (path: string): boolean =>
  /\.excalidraw(?:\.json)?$/i.test(path.split(/[?#]/, 1)[0] ?? "");

export function ExcalidrawFilePreview(props: {
  readonly text: string;
  readonly name: string;
  readonly theme: ThemeAppearance;
}) {
  return (
    <Suspense fallback={<FileSurfaceLoading />}>
      <ExcalidrawViewer {...props} />
    </Suspense>
  );
}
