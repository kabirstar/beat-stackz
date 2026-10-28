export type InProgressBucketKey = "beat" | "main" | "bg" | "adlib" | "demo" | "mixed";

export interface InProgressBucketSpec {
  key: InProgressBucketKey;
  label: string;
  shortLabel: string;
  desc: string;
  badgeColor: string;
}

export const IN_PROGRESS_ROOT_FOLDER_NAME = "in progress";

export const IN_PROGRESS_BUCKETS: ReadonlyArray<InProgressBucketSpec> = [
  {
    key: "beat",
    label: "Beat",
    shortLabel: "BEAT",
    desc: "instrumental · 2-track · drum & melody stems",
    badgeColor: "#dc2626",
  },
  {
    key: "main",
    label: "Main Vocal",
    shortLabel: "MAIN",
    desc: "lead vocal takes · hook & verse leads",
    badgeColor: "#2563eb",
  },
  {
    key: "bg",
    label: "Background",
    shortLabel: "BG",
    desc: "harmonies · doubles · vocal stacks",
    badgeColor: "#7c3aed",
  },
  {
    key: "adlib",
    label: "Adlibs",
    shortLabel: "ADLIB",
    desc: "ad-libs · hype throws · vocal fx",
    badgeColor: "#d97706",
  },
  {
    key: "demo",
    label: "Demo",
    shortLabel: "DEMO",
    desc: "rough bounce · reference · .flp session",
    badgeColor: "#059669",
  },
  {
    key: "mixed",
    label: "Mixed",
    shortLabel: "MIXED",
    desc: "producer mix revisions · final masters",
    badgeColor: "#0891b2",
  },
] as const;

export function isInProgressBucketKey(name: string): name is InProgressBucketKey {
  const lower = name.trim().toLowerCase();
  return IN_PROGRESS_BUCKETS.some((b) => b.key === lower);
}

/**
 * Classifies an exported FL Studio stem or bounce file into one of the 6 song ecosystem subfolders:
 * `beat`, `main`, `bg`, `adlib`, `demo`, or `mixed`.
 */
export function classifyFlStudioStem(
  rawFilename: string,
  totalFilesInBatch = 1,
): InProgressBucketKey {
  const baseName = rawFilename.split("/").pop()?.split("\\").pop() ?? rawFilename;
  const lower = baseName.toLowerCase();
  const extMatch = lower.match(/\.([a-z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : "";

  // Strip extension and normalize separators (underscores, dashes, dots, brackets) to spaces
  const stemPart = lower
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[\[\]()_.+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // 1. Adlibs (check before generic vocal keywords so "vocal adlib" routes to adlib)
  if (
    /\b(adlib|adlibs|ad lib|ad libs|libs|throw|throws|hype|shout|shouts| Chant|fx vox|vox fx|punct)\b/i.test(
      stemPart,
    )
  ) {
    return "adlib";
  }

  // 2. Background / Harmonies / Stacks / Doubles
  if (
    /\b(bg|bgs|bgv|background|backgrounds|backing|back vox|harm|harmony|harmonies|stack|stacks|double|doubles|dub|dubs|layer|layers|choir|vox l|vox r|vocal l|vocal r|high l|high r|low l|low r)\b/i.test(
      stemPart,
    )
  ) {
    return "bg";
  }

  // 3. Mixed / Mastered revisions from producer
  if (
    /\b(mixed|mix v\d+|mix rev\d*|mixdown|master|mastered|final mix|final master|print|mix bounce)\b/i.test(
      stemPart,
    ) ||
    (/\bmix\b/i.test(stemPart) && !/\bmixer\b/i.test(stemPart))
  ) {
    return "mixed";
  }

  // 4. Demo / Rough Reference / FLP Project
  if (
    ext === "flp" ||
    /\b(demo|rough|ref|reference|scratch|idea|preview|2track bounce|full song|full bounce)\b/i.test(
      stemPart,
    )
  ) {
    return "demo";
  }

  // 5. Main / Lead Vocals
  if (
    /\b(main|lead|leads|vox|vocal|vocals|verse|hook|chorus|bridge|rap|freestyle|aca|acapella|take|dry vox|wet vox|rec)\b/i.test(
      stemPart,
    )
  ) {
    return "main";
  }

  // 6. Beat / Instrumental / Drum & Melody Stems
  if (
    /\b(beat|inst|instrumental|2track|2 track|loop|808|sub|bass|kick|snare|clap|hat|hihat|hi hat|open hat|perc|rim|cymbal|crash|drum|drums|melody|synth|pad|keys|piano|rhodes|bell|pluck|arp|guitar|strings|brass|flute|sample|chop)\b/i.test(
      stemPart,
    )
  ) {
    return "beat";
  }

  // Fallback heuristics:
  // If a batch has multiple WAV stems and one MP3, the MP3 is almost always the rough demo bounce
  if (totalFilesInBatch > 2 && ext === "mp3") {
    return "demo";
  }

  // Default to beat for unmarked mixer inserts in a stem pack
  return "beat";
}

/**
 * Infers a clean Song Title from a dropped folder name, .zip filename, .flp file, or common stem prefix.
 */
export function inferSongTitleFromBatch(
  filenames: string[],
  containerName?: string | null,
): string {
  const cleanLabel = (raw: string): string => {
    return raw
      .replace(/\.(zip|flp|wav|mp3|flac|aiff|m4a)$/i, "")
      .replace(/\b(stems|split mixer tracks|trackout|export|session|folder|zipped loop package)\b/gi, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  if (containerName && containerName.trim()) {
    const cleaned = cleanLabel(containerName);
    if (cleaned.length >= 2) return cleaned;
  }

  // Check if there is an .flp file in the batch
  const flpFile = filenames.find((f) => f.toLowerCase().endsWith(".flp"));
  if (flpFile) {
    const base = flpFile.split("/").pop()?.split("\\").pop() ?? flpFile;
    const cleaned = cleanLabel(base);
    if (cleaned.length >= 2) return cleaned;
  }

  if (filenames.length > 0) {
    // Check if files share a prefix before "_" or " - " (FL Studio exports `SongName - MixerTrack.wav` or `SongName_Main.wav`)
    const bases = filenames.map((f) =>
      (f.split("/").pop()?.split("\\").pop() ?? f).replace(/\.[a-z0-9]+$/i, ""),
    );

    const dashParts = bases
      .map((b) => b.split(/\s+-\s+/)[0]?.trim())
      .filter((p): p is string => Boolean(p && p.length >= 2));
    if (dashParts.length >= 2 && dashParts.every((p) => p.toLowerCase() === dashParts[0].toLowerCase())) {
      return cleanLabel(dashParts[0]) || "Untitled Song";
    }

    const firstTokens = bases
      .map((b) => b.split(/[_\s-]+/)[0]?.trim())
      .filter((p): p is string => Boolean(p && p.length >= 2));
    if (
      firstTokens.length >= 2 &&
      firstTokens.every((t) => t.toLowerCase() === firstTokens[0].toLowerCase())
    ) {
      return cleanLabel(firstTokens[0]) || "Untitled Song";
    }

    const firstClean = cleanLabel(bases[0]);
    if (firstClean.length >= 2) {
      return firstClean;
    }
  }

  return `Song Session ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function guessMimeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".flac")) return "audio/flac";
  if (lower.endsWith(".aiff") || lower.endsWith(".aif")) return "audio/aiff";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".flp")) return "application/octet-stream";
  return "audio/wav";
}

const SUPPORTED_SESSION_EXTENSIONS = new Set([
  "wav",
  "mp3",
  "flac",
  "aiff",
  "aif",
  "m4a",
  "ogg",
  "flp",
]);

export function isSupportedSessionFile(filename: string): boolean {
  const base = filename.split("/").pop()?.split("\\").pop() ?? filename;
  if (!base || base.startsWith(".") || base.startsWith("__MACOSX")) return false;
  const ext = base.toLowerCase().split(".").pop() ?? "";
  return SUPPORTED_SESSION_EXTENSIONS.has(ext);
}

/**
 * Extracts supported audio / .flp files from a .zip file in the browser using native Web APIs
 * (supports both STORE method 0 and DEFLATE method 8 via DecompressionStream("deflate-raw")).
 */
export async function extractSessionFilesFromZip(zipFile: File): Promise<File[]> {
  const buffer = await zipFile.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder("utf-8");

  // Locate End of Central Directory (EOCD) signature 0x06054b50
  let eocdOffset = -1;
  const minEocdSearch = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minEocdSearch; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error("Invalid .zip file");
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  const extracted: File[] = [];
  let ptr = centralDirOffset;

  for (let idx = 0; idx < totalEntries; idx++) {
    if (ptr + 46 > bytes.length || view.getUint32(ptr, true) !== 0x02014b50) {
      break;
    }
    const compressionMethod = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const fileNameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const rawPath = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + fileNameLen));
    ptr += 46 + fileNameLen + extraLen + commentLen;

    if (rawPath.endsWith("/") || rawPath.includes("__MACOSX/")) continue;
    const baseName = rawPath.split("/").pop()?.split("\\").pop() ?? rawPath;
    if (!isSupportedSessionFile(baseName)) continue;

    if (
      localHeaderOffset + 30 > bytes.length ||
      view.getUint32(localHeaderOffset, true) !== 0x04034b50
    ) {
      continue;
    }
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compressedSlice = bytes.subarray(dataStart, dataStart + compressedSize);

    let fileBytes: Uint8Array | null = null;
    if (compressionMethod === 0) {
      fileBytes = compressedSlice;
    } else if (compressionMethod === 8 && typeof DecompressionStream !== "undefined") {
      try {
        const ds = new DecompressionStream("deflate-raw");
        const writer = ds.writable.getWriter();
        void writer.write(compressedSlice);
        void writer.close();
        const decompressedBuf = await new Response(ds.readable).arrayBuffer();
        fileBytes = new Uint8Array(decompressedBuf);
      } catch {
        fileBytes = null;
      }
    }

    if (fileBytes) {
      const mime = guessMimeFromFilename(baseName);
      const copy = new Uint8Array(fileBytes.byteLength);
      copy.set(fileBytes);
      extracted.push(new File([copy], baseName, { type: mime }));
    }
  }

  return extracted;
}

/**
 * Recursively reads files from a drag-and-drop DataTransfer (supports dropping an entire FL Studio export folder).
 */
export async function readDroppedSessionDataTransfer(
  dataTransfer: DataTransfer,
): Promise<{ files: File[]; detectedContainerName: string | null }> {
  const outFiles: File[] = [];
  let detectedContainerName: string | null = null;

  const readEntry = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const file = await new Promise<File | null>((resolve) => {
        fileEntry.file(
          (f) => resolve(f),
          () => resolve(null),
        );
      });
      if (file) outFiles.push(file);
    } else if (entry.isDirectory) {
      if (!detectedContainerName) {
        detectedContainerName = entry.name;
      }
      const dirEntry = entry as FileSystemDirectoryEntry;
      const reader = dirEntry.createReader();
      const readAllBatches = async (): Promise<FileSystemEntry[]> => {
        const batch = await new Promise<FileSystemEntry[]>((resolve) => {
          reader.readEntries(
            (entries) => resolve(entries),
            () => resolve([]),
          );
        });
        if (batch.length === 0) return [];
        const rest = await readAllBatches();
        return [...batch, ...rest];
      };
      const children = await readAllBatches();
      for (const child of children) {
        await readEntry(child);
      }
    }
  };

  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .map((item) =>
      typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null,
    )
    .filter((e): e is FileSystemEntry => e !== null);

  if (entries.length > 0) {
    for (const entry of entries) {
      await readEntry(entry);
    }
  } else {
    for (const f of Array.from(dataTransfer.files ?? [])) {
      outFiles.push(f);
    }
  }

  return { files: outFiles, detectedContainerName };
}
