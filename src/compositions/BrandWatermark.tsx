import { Img, staticFile } from "remotion";
import { theme } from "../diagrams/shared/theme";

export function BrandWatermark() {
  return (
    <Img
      src={staticFile("assets/brand-logo.jpeg")}
      style={{
        position: "absolute",
        top: theme.layout.stagePadding / 2,
        right: theme.layout.stagePadding / 2,
        width: 96,
        height: 96,
        borderRadius: 16,
        objectFit: "cover",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}
    />
  );
}
