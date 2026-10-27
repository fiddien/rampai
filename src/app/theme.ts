import { createTheme, type CSSVariablesResolver, type MantineColorsTuple } from "@mantine/core";

/**
 * Rampai's look, as a Mantine theme: ink on paper, one accent, quiet corners.
 * The page colours stay in style.css (--bg, --ink, --soft, --faint, --accent),
 * so the writing surface and Mantine's components draw from the same values.
 */
const ink: MantineColorsTuple = ["#f4f5f6", "#e7e9eb", "#cdd1d5", "#b1b7bd", "#99a0a7", "#8a9299", "#6d737a", "#4f555b", "#3a3f45", "#23272c"];
const accent: MantineColorsTuple = ["#eef2fd", "#dbe3fb", "#b5c6f5", "#8ea8ff", "#6f8fe9", "#557ae0", "#4268d9", "#2f5bd3", "#284fb8", "#1f3f94"];

export const theme = createTheme({
  primaryColor: "ink",
  primaryShade: { light: 9, dark: 1 },
  autoContrast: true,
  colors: { ink, accent },
  fontFamily: '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  fontFamilyMonospace: "ui-monospace, Menlo, Consolas, monospace",
  headings: { fontFamily: '"Newsreader", Georgia, "Times New Roman", serif', fontWeight: "500" },
  defaultRadius: "sm",
  cursorType: "pointer",
  focusRing: "auto",
  components: {
    Button: { defaultProps: { fw: 400 } },
    Anchor: { defaultProps: { underline: "hover", inherit: true } },
    Text: { defaultProps: { size: "sm" } },
    Modal: { defaultProps: { centered: true, radius: "md", overlayProps: { backgroundOpacity: 0.35 } } },
    Notification: { defaultProps: { radius: "sm", withBorder: false } },
  },
});

/** Mantine's page colours follow Rampai's, in light and in dark. */
export const cssVariables: CSSVariablesResolver = () => ({
  variables: {
    "--mantine-color-body": "var(--bg)",
    "--mantine-color-text": "var(--ink)",
    "--mantine-color-dimmed": "var(--soft)",
    "--mantine-color-default-border": "var(--faint)",
  },
  // Links keep Rampai's one accent in both schemes (Mantine would use the primary ink).
  light: { "--mantine-color-anchor": "var(--accent)" },
  dark: { "--mantine-color-anchor": "var(--accent)" },
});
