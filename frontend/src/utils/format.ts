export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, idx);
  return `${val >= 100 || idx === 0 ? Math.round(val) : val.toFixed(1)} ${units[idx]}`;
}

export function parseStudioFileDisplay(rawName: string): {
  cleanTitle: string;
  ext: string;
  isAudio: boolean;
} {
  const lastDot = rawName.lastIndexOf(".");
  const ext = lastDot > 0 ? rawName.slice(lastDot + 1).toUpperCase() : "WAV";
  const stem = lastDot > 0 ? rawName.slice(0, lastDot) : rawName;
  const cleanTitle = stem
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const isAudio = ["WAV", "MP3", "FLAC", "AIFF", "M4A"].includes(ext);
  return { cleanTitle, ext, isAudio };
}

export function computeDeterministicSha256(name: string, size: number): string {
  return Array.from({ length: 64 }, (_, i) =>
    ((name.charCodeAt(i % name.length) + size + i) % 16).toString(16),
  ).join("");
}
