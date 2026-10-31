import { useRef } from "react";

// Lab 4 BR-38, FR-19: every create form sends one request at a time. Disabling the
// button on the next render is not enough on its own: two submits that reach the
// handler before React has re-rendered (a double click, Enter pressed twice, a
// retry racing the first call) would both see "not busy". A ref changes at once,
// so the second call is turned away before it can send anything.
export function useSingleFlight() {
  const flying = useRef(false);
  return {
    /** Returns false when a request from this form is already in flight. */
    begin(): boolean {
      if (flying.current) return false;
      flying.current = true;
      return true;
    },
    end(): void {
      flying.current = false;
    },
  };
}
