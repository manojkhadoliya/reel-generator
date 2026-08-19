import { loadFont } from "@remotion/google-fonts/NotoSansDevanagari";

/**
 * Registers the Devanagari @font-face via Remotion's self-hosted Google Fonts bundle so Hindi
 * captions render correctly inside the headless-Chromium renderer regardless of which fonts
 * happen to be installed on the render host. Imported once (for its side effect) from the root
 * composition — theme.ts references the resulting family name in its font-family fallback chain.
 */
// Only the devanagari subset and the weights theme.ts actually uses (400/600/700) — Latin text
// keeps resolving through Segoe UI/Inter, this font only needs to cover glyphs those lack.
export const { fontFamily: devanagariFontFamily } = loadFont("normal", {
  weights: ["400", "600", "700"],
  subsets: ["devanagari"],
});
