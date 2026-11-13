import { AbsoluteFill, Img, staticFile } from "remotion";
import { z } from "zod";
import { theme } from "../diagrams/shared/theme";
import { ReelScriptSchema } from "../pipeline/types";

export const reelCoverPropsSchema = z.object({
  script: ReelScriptSchema,
});

export type ReelCoverProps = z.infer<typeof reelCoverPropsSchema>;

const LOGO_SIZE = 560;

/**
 * Instagram cover image (9:16). Feed posts show only the middle 1:1 square of a reel's cover and
 * the profile grid a middle 3:4 slice, so the logo and title both sit inside the central
 * 1080x1080 square to stay visible everywhere.
 */
export function ReelCover({ script }: ReelCoverProps) {
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 42%, #16204a 0%, ${theme.colors.background} 55%)`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: theme.layout.width,
          height: theme.layout.width,
          padding: `40px ${theme.layout.stagePadding}px`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 48,
          boxSizing: "border-box",
        }}
      >
        <Img
          src={staticFile("assets/brand-logo.jpeg")}
          style={{
            width: LOGO_SIZE,
            height: LOGO_SIZE,
            // The logo is a circle on a black square; clipping hides the square's corners.
            borderRadius: "50%",
            boxShadow: "0 0 80px rgba(56,130,246,0.35)",
          }}
        />
        <div
          style={{
            color: theme.colors.text,
            fontFamily: theme.font.family,
            fontWeight: 800,
            fontSize: 72,
            lineHeight: 1.15,
            textAlign: "center",
            textWrap: "balance",
          }}
        >
          {/* Non-breaking hyphens keep terms like "6-digit" on one line. */}
          {script.topic.replaceAll("-", "‑")}
        </div>
      </div>
    </AbsoluteFill>
  );
}
