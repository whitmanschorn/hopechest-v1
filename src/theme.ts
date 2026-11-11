import { createTheme, type CSSVariablesResolver, type MantineColorsTuple } from "@mantine/core";

// The demo's palette: parchment paper, walnut ink, sepia and brass accents.
const sepia: MantineColorsTuple = [
  "#fbf3ea",
  "#f1e4d3",
  "#e2c7a5",
  "#d3a874",
  "#c68e4b",
  "#b3884f",
  "#a06c3a",
  "#8a5a33",
  "#6f4728",
  "#4a3526",
];

const rosewood: MantineColorsTuple = [
  "#fbeeed",
  "#f1d9d6",
  "#e2b0ab",
  "#d3857e",
  "#c66158",
  "#b54c43",
  "#9a423b",
  "#7d3b34",
  "#63302b",
  "#4a2420",
];

export const theme = createTheme({
  fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
  fontFamilyMonospace: "var(--font-geist-mono), ui-monospace, monospace",
  headings: { fontFamily: "var(--font-fraunces), Georgia, serif", fontWeight: "600" },
  colors: { sepia, rosewood },
  primaryColor: "sepia",
  primaryShade: { light: 7, dark: 4 },
  defaultRadius: "md",
  other: {
    parchment: "#f6efe2",
    cream: "#fdf9f0",
    ink: "#2e241a",
    inkSoft: "#6b5d4b",
    hairline: "#e4d8c2",
  },
});

/** Page, text and border colours for each scheme. Components read these
 * through Mantine's own variables, so nothing else needs to know the palette. */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    "--mantine-color-body": "#f6efe2",
    "--mantine-color-text": "#2e241a",
    "--mantine-color-dimmed": "#6b5d4b",
    "--mantine-color-default": "#fdf9f0",
    "--mantine-color-default-hover": "#f6efe2",
    "--mantine-color-default-border": "#e4d8c2",
    "--mantine-color-error": "#9a423b",
    "--hc-surface": "#fdf9f0",
    "--hc-hairline": "#e4d8c2",
  },
  dark: {
    "--mantine-color-body": "#1d1712",
    "--mantine-color-text": "#efe6d6",
    "--mantine-color-dimmed": "#b3a48d",
    "--mantine-color-default": "#2a221a",
    "--mantine-color-default-hover": "#352b21",
    "--mantine-color-default-border": "#45392c",
    "--mantine-color-error": "#e2b0ab",
    "--hc-surface": "#2a221a",
    "--hc-hairline": "#45392c",
  },
});
