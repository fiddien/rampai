// jsdom lacks a few browser APIs that Mantine relies on.
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }
  if (!("ResizeObserver" in window)) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  // Textarea autosize listens for fonts loading.
  if (!(document as Document & { fonts?: unknown }).fonts) {
    Object.defineProperty(document, "fonts", { value: { addEventListener() {}, removeEventListener() {}, ready: Promise.resolve() } });
  }
}

import { afterEach } from "vitest";
// Unmount whatever a test rendered, so the next one starts from an empty page.
afterEach(async () => {
  if (typeof document !== "undefined") (await import("@testing-library/react")).cleanup();
});
