import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { AppContext, type AppContextValue } from "../src/app/context";
import { theme } from "../src/app/theme";

export class MemoryStore {
  m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem = (k: string) => void this.m.delete(k);
  get length() {
    return this.m.size;
  }
  key = (i: number) => Array.from(this.m.keys())[i] ?? null;
}

/** Render inside Rampai's providers, with a test app context. */
export function renderApp(ui: ReactNode, ctx: Partial<AppContextValue> = {}) {
  const value: AppContextValue = {
    store: new MemoryStore(),
    session: new MemoryStore(),
    device: undefined,
    refreshDevice: vi.fn(async () => {}),
    persists: true,
    go: vi.fn(),
    say: vi.fn(),
    ...ctx,
  };
  const wrap = (node: ReactNode) => (
    <MantineProvider theme={theme}>
      <ModalsProvider>
        <AppContext.Provider value={value}>{node}</AppContext.Provider>
      </ModalsProvider>
    </MantineProvider>
  );
  const result = render(wrap(ui));
  return { ...result, rerender: (node: ReactNode) => result.rerender(wrap(node)), ctx: value };
}
