import type { FileItem } from "@bpackz/shared";

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

export async function computeBlobSha256(
  blob: Blob | undefined,
  fallbackName: string,
  fallbackSize: number,
): Promise<string> {
  if (blob && typeof globalThis.crypto?.subtle?.digest === "function") {
    const buf = await blob.arrayBuffer();
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return computeDeterministicSha256(fallbackName, fallbackSize);
}

/**
 * TOD-105: put the file an upload just returned into the list at once, instead of waiting for
 * the rest of the batch and a full vault refetch. Uses the server's row as is (status included).
 */
export function showUploadedFile(
  setFilesByFolder: (
    update: (prev: Record<string, FileItem[]>) => Record<string, FileItem[]>,
  ) => void,
  file: FileItem,
  activeVaultId: string | null,
): FileItem {
  if (file.vaultId === activeVaultId) {
    const key = file.folderId ?? "root";
    setFilesByFolder((prev) => ({
      ...prev,
      [key]: [...(prev[key] ?? []).filter((f) => f.id !== file.id), file],
    }));
  }
  return file;
}

export function createSampleWavBlob(): Blob {
  const sampleRate = 8000;
  const numSamples = 4000; // 0.5s 440Hz tone
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, numSamples * 2, true);
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 0.25;
    view.setInt16(44 + i * 2, sample * 32767, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
