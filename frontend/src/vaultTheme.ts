import type { FileItem, Folder, User, VaultMember } from "@bpackz/shared";

export interface HardwareThemeSlot {
  name: string;
  chassisBg: string;
  chassisMid: string;
  chassisEdge: string;
  chassisBorder: string;
  accentPrimary: string;
  accentSecondary: string;
  padIdle: string;
  knobInk: string;
  stampColor: string;
}

// FIXED THEME 1 — SWISH: Mostly Black & Red (Stealth Matte Obsidian Black Chassis + Crimson Studio Accents)
export const SWISH_BLACK_RED_PALETTE: HardwareThemeSlot[] = [
  {
    name: "Obsidian / Crimson",
    chassisBg: "#0b0a0c",
    chassisMid: "#151215",
    chassisEdge: "#040405",
    chassisBorder: "rgba(220, 38, 38, 0.34)",
    accentPrimary: "#dc2626",
    accentSecondary: "#27272a",
    padIdle: "rgba(220, 38, 38, 0.14)",
    knobInk: "#ffffff",
    stampColor: "#ef4444",
  },
  {
    name: "Stealth / Ruby",
    chassisBg: "#0d0b0c",
    chassisMid: "#181315",
    chassisEdge: "#050405",
    chassisBorder: "rgba(239, 68, 68, 0.3)",
    accentPrimary: "#ef4444",
    accentSecondary: "#1c1917",
    padIdle: "rgba(239, 68, 68, 0.13)",
    knobInk: "#09090b",
    stampColor: "#dc2626",
  },
  {
    name: "Pitch Black / Scarlet",
    chassisBg: "#09090b",
    chassisMid: "#141214",
    chassisEdge: "#030304",
    chassisBorder: "rgba(185, 28, 28, 0.38)",
    accentPrimary: "#b91c1c",
    accentSecondary: "#dc2626",
    padIdle: "rgba(185, 28, 28, 0.15)",
    knobInk: "#ffffff",
    stampColor: "#f87171",
  },
  {
    name: "Carbon / Blood Red",
    chassisBg: "#0f0c0d",
    chassisMid: "#1b1416",
    chassisEdge: "#060405",
    chassisBorder: "rgba(225, 29, 72, 0.32)",
    accentPrimary: "#e11d48",
    accentSecondary: "#262626",
    padIdle: "rgba(225, 29, 72, 0.14)",
    knobInk: "#ffffff",
    stampColor: "#fb7185",
  },
  {
    name: "Matte Black / Red",
    chassisBg: "#0a090a",
    chassisMid: "#161315",
    chassisEdge: "#040304",
    chassisBorder: "rgba(220, 38, 38, 0.35)",
    accentPrimary: "#dc2626",
    accentSecondary: "#991b1b",
    padIdle: "rgba(220, 38, 38, 0.14)",
    knobInk: "#ffffff",
    stampColor: "#ef4444",
  },
];

// FIXED THEME 2 — TODO: White & Black Monochrome (Architectural Chalk White & Matte Carbon Hardware)
export const TODO_MONOCHROME_PALETTE: HardwareThemeSlot[] = [
  {
    name: "Carbon / Chalk",
    chassisBg: "#121215",
    chassisMid: "#242429",
    chassisEdge: "#050507",
    chassisBorder: "rgba(255, 255, 255, 0.24)",
    accentPrimary: "#fafafa",
    accentSecondary: "#d4d4d8",
    padIdle: "rgba(255, 255, 255, 0.12)",
    knobInk: "#09090b",
    stampColor: "#fafafa",
  },
  {
    name: "Chalk / Carbon",
    chassisBg: "#f4f4f5",
    chassisMid: "#d4d4d8",
    chassisEdge: "#18181b",
    chassisBorder: "rgba(9, 9, 11, 0.25)",
    accentPrimary: "#111114",
    accentSecondary: "#3f3f46",
    padIdle: "rgba(9, 9, 11, 0.1)",
    knobInk: "#ffffff",
    stampColor: "#111114",
  },
  {
    name: "Obsidian / Ivory",
    chassisBg: "#18181b",
    chassisMid: "#27272a",
    chassisEdge: "#09090b",
    chassisBorder: "rgba(255, 255, 255, 0.24)",
    accentPrimary: "#ffffff",
    accentSecondary: "#a1a1aa",
    padIdle: "rgba(255, 255, 255, 0.12)",
    knobInk: "#09090b",
    stampColor: "#e4e4e7",
  },
  {
    name: "Ivory / Graphite",
    chassisBg: "#fafafa",
    chassisMid: "#e4e4e7",
    chassisEdge: "#18181b",
    chassisBorder: "rgba(9, 9, 11, 0.24)",
    accentPrimary: "#09090b",
    accentSecondary: "#52525b",
    padIdle: "rgba(9, 9, 11, 0.1)",
    knobInk: "#ffffff",
    stampColor: "#09090b",
  },
  {
    name: "Monolith Black",
    chassisBg: "#0d0d10",
    chassisMid: "#1f1f24",
    chassisEdge: "#040405",
    chassisBorder: "rgba(255, 255, 255, 0.26)",
    accentPrimary: "#f4f4f5",
    accentSecondary: "#e4e4e7",
    padIdle: "rgba(255, 255, 255, 0.12)",
    knobInk: "#09090b",
    stampColor: "#ffffff",
  },
];

export function generateRandomSharedPalette(): HardwareThemeSlot[] {
  const baseHue = Math.floor(Math.random() * 360);
  const step = 52 + Math.floor(Math.random() * 40);
  const slots: HardwareThemeSlot[] = [];
  for (let i = 0; i < 5; i++) {
    const h1 = (baseHue + i * step) % 360;
    const h2 = (h1 + 145) % 360;
    slots.push({
      name: `Shared #${i + 1}`,
      chassisBg: `hsl(${h1}, 28%, 14%)`,
      chassisMid: `hsl(${h1}, 32%, 22%)`,
      chassisEdge: `hsl(${h1}, 35%, 8%)`,
      chassisBorder: `hsla(${h1}, 75%, 65%, 0.3)`,
      accentPrimary: `hsl(${h1}, 82%, 58%)`,
      accentSecondary: `hsl(${h2}, 82%, 60%)`,
      padIdle: `hsla(${h1}, 70%, 60%, 0.15)`,
      knobInk: "#09090b",
      stampColor: `hsl(${h2}, 85%, 70%)`,
    });
  }
  return slots;
}

export const WAVEFORM_BARS = [
  28, 52, 68, 42, 85, 92, 61, 74, 38, 65, 88, 95, 70, 54, 80, 91, 63, 47, 76, 84,
  58, 40, 72, 89, 66, 51, 37, 62,
];

export const ICON_TYPES = [
  { key: "rap_cup", label: "Lean Cup" },
  { key: "rap_chain", label: "Diamond Chain" },
  { key: "rap_money", label: "Cash Stack" },
  { key: "rap_lambo", label: "Lambo" },
  { key: "rap_watch", label: "Bust-Down Watch" },
  { key: "beats", label: "Drum Pads" },
  { key: "presets", label: "Synth Knobs" },
  { key: "vocals", label: "Studio Mic" },
  { key: "songs", label: "Master Tape" },
  { key: "media", label: "Camera Lens" },
  { key: "sub_mix", label: "Mixer Faders" },
  { key: "sub_mv", label: "Clapperboard" },
] as const;

export const SHARED_RAP_ICON_MAP: Record<string, string> = {
  beats: "rap_cup",
  presets: "rap_chain",
  vocals: "rap_money",
  songs: "rap_lambo",
  media: "rap_watch",
};

export interface FolderUiMeta {
  by: string;
  colorSlot: number;
  iconKey: string;
  order: number;
}

const DEFAULT_ROOT_META: Record<string, FolderUiMeta> = {
  beats: { by: "instrumentals & loops", colorSlot: 0, iconKey: "beats", order: 0 },
  presets: { by: "plugin · vocals", colorSlot: 1, iconKey: "presets", order: 1 },
  vocals: { by: "main · adlib · bg", colorSlot: 2, iconKey: "vocals", order: 2 },
  songs: { by: "demo · mix · drop", colorSlot: 3, iconKey: "songs", order: 3 },
  media: { by: "photos · videos · covers", colorSlot: 4, iconKey: "media", order: 4 },
};

const DEFAULT_SUB_META: Record<string, FolderUiMeta> = {
  plugin: { by: "vst patches & fx", colorSlot: 0, iconKey: "sub_plugin", order: 0 },
  vocals: { by: "vocal chains & throws", colorSlot: 1, iconKey: "sub_preamp", order: 1 },
  main: { by: "lead vocal takes", colorSlot: 0, iconKey: "vocals", order: 0 },
  adlib: { by: "hype throws & fx", colorSlot: 1, iconKey: "sub_adlib", order: 1 },
  bg: { by: "harmonies & stacks", colorSlot: 2, iconKey: "sub_bg", order: 2 },
  demo: { by: "rough bounces", colorSlot: 0, iconKey: "songs", order: 0 },
  mix: { by: "mix revisions", colorSlot: 1, iconKey: "sub_mix", order: 1 },
  drop: { by: "final masters", colorSlot: 2, iconKey: "sub_drop", order: 2 },
  photos: { by: "stills & press shots", colorSlot: 0, iconKey: "media", order: 0 },
  videos: { by: "reels & teasers", colorSlot: 1, iconKey: "sub_video", order: 1 },
  "music video": { by: "master cuts", colorSlot: 2, iconKey: "sub_mv", order: 2 },
  bts: { by: "behind the scenes", colorSlot: 3, iconKey: "songs", order: 3 },
  "album covers": { by: "cover art & sleeves", colorSlot: 4, iconKey: "sub_covers", order: 4 },
};

const UI_META_STORAGE_KEY = "bpackz_vault_ui_meta_v2";

export interface TrashedFileEntry {
  file: FileItem;
  folderName: string;
  deletedAt: number;
}

export interface PersistedUiMeta {
  folderMeta: Record<string, FolderUiMeta>;
  sharedVaultPalettes: Record<string, HardwareThemeSlot[]>;
  trashedByVault: Record<string, TrashedFileEntry[]>;
  shareLinkTokens: Record<string, { id: string; token: string; expiry: string; fileId: string }[]>;
}

export function loadPersistedUiMeta(): PersistedUiMeta {
  const empty: PersistedUiMeta = {
    folderMeta: {},
    sharedVaultPalettes: {},
    trashedByVault: {},
    shareLinkTokens: {},
  };
  if (typeof window === "undefined" || !window.localStorage) return empty;
  try {
    const raw = window.localStorage.getItem(UI_META_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedUiMeta>;
      return {
        folderMeta: parsed.folderMeta ?? {},
        sharedVaultPalettes: parsed.sharedVaultPalettes ?? {},
        trashedByVault: parsed.trashedByVault ?? {},
        shareLinkTokens: parsed.shareLinkTokens ?? {},
      };
    }
  } catch {
    // ignore storage errors
  }
  return empty;
}

export function savePersistedUiMeta(meta: PersistedUiMeta) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(UI_META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // ignore storage errors
  }
}

export function resolveFolderUiMeta(
  folder: Folder,
  customMetaMap: Record<string, FolderUiMeta>,
  fallbackIndex = 0,
  isSharedMainPage = false,
): FolderUiMeta {
  const applySharedIcon = (meta: FolderUiMeta): FolderUiMeta => {
    if (isSharedMainPage && folder.parentId === null && SHARED_RAP_ICON_MAP[meta.iconKey]) {
      return { ...meta, iconKey: SHARED_RAP_ICON_MAP[meta.iconKey] };
    }
    return meta;
  };
  const custom = customMetaMap[folder.id];
  if (custom) return applySharedIcon(custom);
  const lower = folder.name.trim().toLowerCase();
  if (folder.parentId === null && DEFAULT_ROOT_META[lower]) {
    return applySharedIcon(DEFAULT_ROOT_META[lower]);
  }
  if (folder.parentId !== null && DEFAULT_SUB_META[lower]) {
    return DEFAULT_SUB_META[lower];
  }
  return applySharedIcon({
    by: folder.parentId === null ? "custom 3d folder" : "custom subfolder",
    colorSlot: fallbackIndex % 5,
    iconKey: "beats",
    order: 100 + fallbackIndex,
  });
}

export function getOrCreateSharedVaultPalette(
  vaultId: string,
  meta: PersistedUiMeta,
): HardwareThemeSlot[] {
  if (meta.sharedVaultPalettes[vaultId]?.length === 5) {
    return meta.sharedVaultPalettes[vaultId];
  }
  const generated = generateRandomSharedPalette();
  meta.sharedVaultPalettes[vaultId] = generated;
  savePersistedUiMeta(meta);
  return generated;
}

export function describeFileMeta(file: FileItem): string {
  const lower = file.name.toLowerCase();
  if (lower.includes("142bpm")) return "142 BPM · C MIN";
  if (lower.includes("808")) return "150 BPM · F# MIN";
  if (lower.includes("analog_tape")) return "128 BPM · D MIN";
  if (lower.includes("collab_beat")) return "144 BPM · SHARED";
  if (lower.endsWith(".fxp")) return "SYNTH PATCH";
  if (lower.endsWith(".fst")) return "MIXER CHAIN";
  if (lower.includes("master")) return "MASTER · 24-BIT";
  if (lower.includes("mix")) return "MIX · 24-BIT";
  if (lower.includes("demo") || lower.endsWith(".mp3")) return "ROUGH BOUNCE";
  if (lower.endsWith(".jpg") || lower.endsWith(".png")) return "STUDIO STILL";
  if (lower.endsWith(".mov") || lower.endsWith(".mp4")) return "4K MASTER VIDEO";
  if (file.mime?.startsWith("audio/")) return "24-BIT · 48KHZ";
  return file.mime?.split("/")[1]?.toUpperCase() || "STUDIO FILE";
}

export function resolveFileOwnerName(
  createdBy: string | null | undefined,
  members?: VaultMember[],
  currentUser?: User | null,
): string {
  if (!createdBy) return currentUser?.name || "Swish";
  if (members && members.length > 0) {
    const matched = members.find((m) => m.userId === createdBy);
    if (matched) {
      return matched.name || matched.email.split("@")[0] || "Member";
    }
  }
  if (currentUser && currentUser.id === createdBy) {
    return currentUser.name || currentUser.email.split("@")[0] || "Swish";
  }
  if (createdBy === "u_prod" || createdBy.toLowerCase().includes("todo")) {
    return "Todo";
  }
  return "Swish";
}
