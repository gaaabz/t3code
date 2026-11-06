import type { VoiceInputState } from "@t3tools/client-runtime/voice-input";
import { useEffect, useRef, type RefObject } from "react";

const HOLD_TO_TALK_MS = 400;

type HoldSpaceInput = {
  speech: {
    available: boolean;
    state: VoiceInputState;
    start(): Promise<void>;
    stop(): Promise<void>;
  };
  disabled: boolean;
  /** Only a space held in an editor inside this element dictates. */
  scopeRef: RefObject<HTMLElement | null>;
  /** Deletes the space the held key typed before dictation began. */
  removeTypedSpace: () => void;
};

/** Holding Space in the editor records; releasing it transcribes. A quick tap still types a space. */
export function useHoldSpaceDictation(input: HoldSpaceInput) {
  const current = useRef(input);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- publishes committed actions to the window keyboard listener
  useEffect(() => {
    current.current = input;
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- owns the window keyboard listeners for hold-to-talk
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let starting: Promise<void> | null = null;
    const disarm = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const release = () => {
      disarm();
      const started = starting;
      starting = null;
      if (started) void started.then(() => current.current.speech.stop());
    };
    const inEditor = (target: EventTarget | null) =>
      target instanceof Element &&
      target.closest('[contenteditable="true"]') !== null &&
      current.current.scopeRef.current?.contains(target) === true;
    const onKeyDown = (event: KeyboardEvent) => {
      const plainSpace =
        event.code === "Space" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.isComposing;
      if (!plainSpace) {
        disarm();
        return;
      }
      if (event.repeat) {
        if (timer !== null || starting !== null) event.preventDefault();
        return;
      }
      const { speech, disabled } = current.current;
      const idle = speech.state.phase === "idle" || speech.state.phase === "error";
      if (!speech.available || disabled || !idle || !inEditor(event.target)) return;
      timer = setTimeout(() => {
        timer = null;
        current.current.removeTypedSpace();
        starting = current.current.speech.start();
      }, HOLD_TO_TALK_MS);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") release();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", release);
    return () => {
      disarm();
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", release);
    };
  }, []);
}
