import { Audio, staticFile } from "remotion";

export function AudioTrack({ audioFileName }: { audioFileName?: string | null }) {
  if (!audioFileName) return null;
  return <Audio src={staticFile(audioFileName)} />;
}
