import { createTheme } from "@mantine/core";

// Placeholder theme. The demo's palette and type scale are ported in the
// app-shell PR; until then only the font wiring is fixed.
export const theme = createTheme({
  fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
  fontFamilyMonospace: "var(--font-geist-mono), ui-monospace, monospace",
  headings: { fontFamily: "var(--font-fraunces), Georgia, serif" },
  primaryColor: "orange",
  defaultRadius: "md",
});
