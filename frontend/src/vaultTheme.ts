import {
  DEFAULT_FOLDERS,
  type FileItem,
  type Folder,
  type FolderKind,
  type User,
  type VaultMember,
} from "@bpackz/shared";

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
  { key: "in_progress", label: "In Progress" },
  { key: "vision_board", label: "Vision Board" },
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
  "vision board": "vision_board",
  "in progress": "in_progress",
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
  "vision board": { by: "notes · songs · threads", colorSlot: 0, iconKey: "vision_board", order: 5 },
  "in progress": { by: "songs · stems · demo · mix", colorSlot: 1, iconKey: "in_progress", order: 6 },
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

// ADR 0002 / T026b: Key 3D hardware icons & order by `folder.kind` first (in DEFAULT_FOLDERS order)
const DEFAULT_KIND_ORDER = new Map<FolderKind, number>();
DEFAULT_FOLDERS.forEach((root, rootIdx) => {
  DEFAULT_KIND_ORDER.set(root.kind, rootIdx);
  root.children.forEach((child, childIdx) => {
    DEFAULT_KIND_ORDER.set(child.kind, childIdx);
  });
});

export const DEFAULT_KIND_META: Record<FolderKind, FolderUiMeta> = {
  beats: { ...DEFAULT_ROOT_META.beats, order: DEFAULT_KIND_ORDER.get("beats") ?? 0 },
  presets: { ...DEFAULT_ROOT_META.presets, order: DEFAULT_KIND_ORDER.get("presets") ?? 1 },
  "presets/plugin": { ...DEFAULT_SUB_META.plugin, order: DEFAULT_KIND_ORDER.get("presets/plugin") ?? 0 },
  "presets/vocals": { ...DEFAULT_SUB_META.vocals, order: DEFAULT_KIND_ORDER.get("presets/vocals") ?? 1 },
  vocals: { ...DEFAULT_ROOT_META.vocals, order: DEFAULT_KIND_ORDER.get("vocals") ?? 2 },
  "vocals/main": { ...DEFAULT_SUB_META.main, order: DEFAULT_KIND_ORDER.get("vocals/main") ?? 0 },
  "vocals/adlib": { ...DEFAULT_SUB_META.adlib, order: DEFAULT_KIND_ORDER.get("vocals/adlib") ?? 1 },
  "vocals/bg": { ...DEFAULT_SUB_META.bg, order: DEFAULT_KIND_ORDER.get("vocals/bg") ?? 2 },
  songs: { ...DEFAULT_ROOT_META.songs, order: DEFAULT_KIND_ORDER.get("songs") ?? 3 },
  "songs/demo": { ...DEFAULT_SUB_META.demo, order: DEFAULT_KIND_ORDER.get("songs/demo") ?? 0 },
  "songs/mix": { ...DEFAULT_SUB_META.mix, order: DEFAULT_KIND_ORDER.get("songs/mix") ?? 1 },
  "songs/drop": { ...DEFAULT_SUB_META.drop, order: DEFAULT_KIND_ORDER.get("songs/drop") ?? 2 },
  media: { ...DEFAULT_ROOT_META.media, order: DEFAULT_KIND_ORDER.get("media") ?? 4 },
  "media/photos": { ...DEFAULT_SUB_META.photos, order: DEFAULT_KIND_ORDER.get("media/photos") ?? 0 },
  "media/videos": { ...DEFAULT_SUB_META.videos, order: DEFAULT_KIND_ORDER.get("media/videos") ?? 1 },
  "media/mv": { ...DEFAULT_SUB_META["music video"], order: DEFAULT_KIND_ORDER.get("media/mv") ?? 2 },
  "media/bts": { ...DEFAULT_SUB_META.bts, order: DEFAULT_KIND_ORDER.get("media/bts") ?? 3 },
  "media/covers": { ...DEFAULT_SUB_META["album covers"], order: DEFAULT_KIND_ORDER.get("media/covers") ?? 4 },
};

const UI_META_STORAGE_KEY = "bpackz_vault_ui_meta_v2";

export interface TrashedFileEntry {
  file: FileItem;
  folderName: string;
  deletedAt: number;
}

export type StickyColorKey = "canary" | "coral" | "mint" | "lavender";

export const STICKY_NOTE_COLORS: Record<
  StickyColorKey,
  { label: string; bg: string; border: string; tagBg: string }
> = {
  canary: {
    label: "Hook / Lyrics",
    bg: "#fef08a",
    border: "rgba(161, 98, 7, 0.35)",
    tagBg: "rgba(161, 98, 7, 0.14)",
  },
  coral: {
    label: "Mix / 808 Note",
    bg: "#fecdd3",
    border: "rgba(190, 18, 60, 0.32)",
    tagBg: "rgba(190, 18, 60, 0.14)",
  },
  mint: {
    label: "Ready / Cleared",
    bg: "#bbf7d0",
    border: "rgba(21, 128, 61, 0.32)",
    tagBg: "rgba(21, 128, 61, 0.14)",
  },
  lavender: {
    label: "Rollout / Visual",
    bg: "#e9d5ff",
    border: "rgba(107, 33, 168, 0.32)",
    tagBg: "rgba(107, 33, 168, 0.14)",
  },
};

export interface VisionBoardNote {
  id: string;
  text: string;
  author: string;
  color: StickyColorKey;
  x: number;
  y: number;
  createdAt: string;
}

export interface VisionBoardFileComment {
  id: string;
  author: string;
  text: string;
  timestampTag?: string;
  createdAt: string;
}

export interface VisionBoardFileNode {
  id: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  fileMime: string | null;
  addedBy: string;
  x: number;
  y: number;
  comments: VisionBoardFileComment[];
}

export interface VisionBoardVaultState {
  notes: VisionBoardNote[];
  fileNodes: VisionBoardFileNode[];
}

export function createDefaultVisionBoardState(vaultFiles: FileItem[] = []): VisionBoardVaultState {
  const defaultFileNodes: VisionBoardFileNode[] = [
    {
      id: "vb_file_1",
      fileId: "fi_sh_b1",
      fileName: "swish_x_todo_collab_beat.wav",
      fileSize: 50_000_000,
      fileMime: "audio/wav",
      addedBy: "Swish",
      x: 90,
      y: 265,
      comments: [
        {
          id: "c_1",
          author: "Swish",
          text: "Bring the 808 glide in 2 bars earlier right at 0:24",
          timestampTag: "0:24",
          createdAt: "9:20 PM",
        },
        {
          id: "c_2",
          author: "Todo",
          text: "Bet, boosted 60Hz on the kick and tucked the synth pad -2dB",
          timestampTag: "0:48",
          createdAt: "9:34 PM",
        },
      ],
    },
    {
      id: "vb_file_2",
      fileId: "fi_sh_vm1",
      fileName: "collab_hook_stems.wav",
      fileSize: 46_000_000,
      fileMime: "audio/wav",
      addedBy: "Todo",
      x: 500,
      y: 260,
      comments: [
        {
          id: "c_3",
          author: "Todo",
          text: "Dry lead vox + stereo adlib throw lined up to 144 BPM",
          timestampTag: "1:12",
          createdAt: "9:50 PM",
        },
      ],
    },
  ];
  const existingIds = new Set(vaultFiles.map((f) => f.id));
  return {
    notes: [
      {
        id: "vb_note_1",
        text: "HOOK IDEA: Double the main vocal on bar 9 & cut the drums for 1 beat before the 808 drops.",
        author: "Swish",
        color: "canary",
        x: 60,
        y: 50,
        createdAt: "Today · 9:15 PM",
      },
      {
        id: "vb_note_2",
        text: "PRODUCER NOTE: Swapped the distorted spinz 808 for the sub brass patch in the outro.",
        author: "Todo",
        color: "coral",
        x: 370,
        y: 45,
        createdAt: "Today · 9:42 PM",
      },
      {
        id: "vb_note_3",
        text: "TRACKLIST ORDER: 1. Obsidian Intro → 2. Nightfall Master → 3. Late Idea Interlude",
        author: "Swish",
        color: "mint",
        x: 700,
        y: 65,
        createdAt: "Today · 10:05 PM",
      },
    ],
    fileNodes: defaultFileNodes.filter((n) => existingIds.has(n.fileId)),
  };
}

export interface PersistedUiMeta {
  folderMeta: Record<string, FolderUiMeta>;
  sharedVaultPalettes: Record<string, HardwareThemeSlot[]>;
  trashedByVault: Record<string, TrashedFileEntry[]>;
  shareLinkTokens: Record<string, { id: string; token: string; expiry: string; fileId: string }[]>;
  visionBoards?: Record<string, VisionBoardVaultState>;
}

export function loadPersistedUiMeta(): PersistedUiMeta {
  const empty: PersistedUiMeta = {
    folderMeta: {},
    sharedVaultPalettes: {},
    trashedByVault: {},
    shareLinkTokens: {},
    visionBoards: {},
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
        visionBoards: parsed.visionBoards ?? {},
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
  // T026b: Key by folder.kind first so renaming a default folder keeps its 3D icon
  if (folder.kind !== null && DEFAULT_KIND_META[folder.kind]) {
    return applySharedIcon(DEFAULT_KIND_META[folder.kind]);
  }
  // Fallback to folder.name only when folder.kind is null
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

// T026b: Sort defaults first in DEFAULT_FOLDERS order, then user folders by name (while respecting custom jiggle order)
export function sortVaultFolders(
  list: Folder[],
  customMetaMap: Record<string, FolderUiMeta> = {},
): Folder[] {
  const allHaveCustomOrder =
    list.length > 0 && list.every((item) => customMetaMap[item.id] !== undefined);
  const rankForFolder = (f: Folder): [number, number] => {
    const kindOrder = f.kind !== null ? DEFAULT_KIND_ORDER.get(f.kind) : undefined;
    if (kindOrder !== undefined) {
      return [0, kindOrder];
    }
    const lower = f.name.trim().toLowerCase();
    const fallback = f.parentId === null ? DEFAULT_ROOT_META[lower] : DEFAULT_SUB_META[lower];
    if (fallback) {
      return [1, fallback.order];
    }
    return [2, 0];
  };

  return [...list].sort((a, b) => {
    if (allHaveCustomOrder) {
      const diff = customMetaMap[a.id].order - customMetaMap[b.id].order;
      if (diff !== 0) return diff;
    }
    const [aTier, aOrder] = rankForFolder(a);
    const [bTier, bOrder] = rankForFolder(b);
    if (aTier !== bTier) return aTier - bTier;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
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
