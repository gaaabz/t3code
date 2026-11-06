import { useRef } from "react";
import { expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, render } from "../../test/render";
import { useHoldSpaceDictation } from "./useHoldSpaceDictation";

type Speech = Parameters<typeof useHoldSpaceDictation>[0]["speech"];

function Probe(props: { speech: Speech; removeTypedSpace: () => void }) {
  const scopeRef = useRef<HTMLFormElement>(null);
  useHoldSpaceDictation({
    speech: props.speech,
    disabled: false,
    scopeRef,
    removeTypedSpace: props.removeTypedSpace,
  });
  return (
    <form ref={scopeRef}>
      <div contentEditable="true" data-testid="editor" />
    </form>
  );
}

function setup() {
  const speech = {
    available: true,
    state: { phase: "idle" as const, error: null, errorAction: null },
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
  };
  return { speech, removeTypedSpace: vi.fn() };
}

const space = (target: Element, type: "keydown" | "keyup", repeat = false) =>
  target.dispatchEvent(
    new KeyboardEvent(type, { code: "Space", key: " ", bubbles: true, cancelable: true, repeat }),
  );

it("records while Space is held in the editor and transcribes on release", async () => {
  const { speech, removeTypedSpace } = setup();
  await using screen = await render(<Probe speech={speech} removeTypedSpace={removeTypedSpace} />, {
    // The hook reads no route state.
    router: false,
  });
  using _timers = fakeTimers();
  const editor = screen.container.querySelector("[data-testid=editor]")!;

  space(editor, "keydown");
  expect(space(editor, "keydown", true)).toBe(false);
  await act(async () => vi.advanceTimersByTime(400));
  expect(removeTypedSpace).toHaveBeenCalledOnce();
  expect(speech.start).toHaveBeenCalledOnce();

  space(editor, "keyup");
  await act(async () => {});
  expect(speech.stop).toHaveBeenCalledOnce();
});

it("types a space without dictating on a quick tap or outside the editor", async () => {
  const { speech, removeTypedSpace } = setup();
  await using screen = await render(<Probe speech={speech} removeTypedSpace={removeTypedSpace} />, {
    // The hook reads no route state.
    router: false,
  });
  using _timers = fakeTimers();
  const editor = screen.container.querySelector("[data-testid=editor]")!;

  expect(space(editor, "keydown")).toBe(true);
  space(editor, "keyup");
  space(document.body, "keydown");
  await act(async () => vi.advanceTimersByTime(1000));

  expect(speech.start).not.toHaveBeenCalled();
  expect(removeTypedSpace).not.toHaveBeenCalled();
  expect(speech.stop).not.toHaveBeenCalled();
});
