import { describe, expect, it } from "vite-plus/test";

import { Suspense } from "react";

import { render } from "../../../test/render";
import ExcalidrawViewer from "./ExcalidrawViewer";

const rectangle = {
  type: "rectangle",
  id: "box",
  x: 0,
  y: 0,
  width: 400,
  height: 100,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  groupIds: [],
  seed: 1,
  version: 1,
  versionNonce: 1,
  isDeleted: false,
};

const scene = (elements: readonly object[]) =>
  JSON.stringify({ type: "excalidraw", version: 2, elements, appState: {}, files: {} });

const renderViewer = (text: string) =>
  render(
    <Suspense fallback={null}>
      <ExcalidrawViewer text={text} name="diagram.excalidraw" theme="light" />
    </Suspense>,
    // The viewer reads no route state.
    { router: false },
  );

describe("ExcalidrawViewer", () => {
  it("renders a drawing as an image that keeps its aspect ratio", async () => {
    await using screen = await renderViewer(scene([rectangle]));
    const image = screen.getByRole("img", { name: "diagram.excalidraw" });
    await expect.element(image).toHaveAttribute("src", expect.stringMatching(/^data:image\/svg/));
    const svg = decodeURIComponent(image.element().getAttribute("src")!.split(",")[1]!);
    const [, width, height] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/) ?? [];
    expect(Number(width) / Number(height)).toBeGreaterThan(3);
  });

  it.each([
    {
      reason: "not JSON",
      text: "not JSON",
      message: "This file is not a valid Excalidraw drawing. Show Excalidraw source to inspect it.",
    },
    {
      reason: "only deleted elements",
      text: scene([{ ...rectangle, isDeleted: true }]),
      message: "This drawing is empty.",
    },
  ])("explains a drawing it cannot show: $reason", async ({ text, message }) => {
    await using screen = await renderViewer(text);
    await expect.element(screen.getByRole("alert")).toHaveTextContent(message);
  });
});
