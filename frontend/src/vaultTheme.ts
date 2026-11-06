import {
  DEFAULT_FOLDERS,
  type FileItem,
  type Folder,
  type FolderKind,
  type User,
  type VaultMember,
} from "@bpackz/shared";

/** Folder cover colours, the same in both themes. Slots 0-4 are the default folders in order. */
export const COVER_COLORS = [
  "#ee6a4a",
  "#9a86ff",
  "#3fbf9f",
  "#f0b23a",
  "#6a9cf5",
  "#f3b6cf",
  "#c3c9b3",
];

export type VaultLook = "night" | "paper";

export const WAVEFORM_BARS = [
  28, 52, 68, 42, 85, 92, 61, 74, 38, 65, 88, 95, 70, 54, 80, 91, 63, 47, 76, 84,
  58, 40, 72, 89, 66, 51, 37, 62,
];

/**
 * Server waveform (audiowaveform min/max pairs) as `count` bar heights in percent, over the whole
 * track. Null when there is too little data to draw.
 */
export function waveformToBars(data: number[], count = 64): number[] | null {
  const peaks = data.filter((_, i) => i % 2 === 1).map(Math.abs);
  if (peaks.length <= 8) return null;
  const n = Math.min(count, peaks.length);
  const max = (list: number[], floor: number) => list.reduce((a, b) => Math.max(a, b), floor);
  const top = max(peaks, 1);
  return Array.from({ length: n }, (_, i) => {
    const from = Math.floor((i * peaks.length) / n);
    const to = Math.floor(((i + 1) * peaks.length) / n);
    return Math.round(25 + (75 * max(peaks.slice(from, to), 0)) / top);
  });
}

export const ICON_TYPES = [
  { key: "beats", label: "Pads" },
  { key: "presets", label: "Faders" },
  { key: "vocals", label: "Mic" },
  { key: "songs", label: "Notes" },
  { key: "media", label: "Screen" },
  { key: "in_progress", label: "In Progress" },
  { key: "vision_board", label: "Vision Board" },
  { key: "rap_cup", label: "Cup" },
  { key: "rap_chain", label: "Chain" },
  { key: "rap_money", label: "Cash" },
  { key: "rap_watch", label: "Watch" },
] as const;

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
  "vision board": { by: "notes · songs · threads", colorSlot: 5, iconKey: "vision_board", order: 5 },
  "in progress": { by: "songs · stems · demo · mix", colorSlot: 6, iconKey: "in_progress", order: 6 },
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

// ADR 0002 / T026b: Key folder icons & order by `folder.kind` first (in DEFAULT_FOLDERS order)
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
  trashedByVault: Record<string, TrashedFileEntry[]>;
  shareLinkTokens: Record<string, { id: string; token: string; expiry: string; fileId: string }[]>;
  visionBoards?: Record<string, VisionBoardVaultState>;
  /** Theme choice, kept per browser until it moves to the account. */
  look?: VaultLook;
  /** Last-opened keys, newest first ("go:<folderId>", "play:<fileId>", "vault:<vaultId>"). */
  recents?: string[];
}

export function loadPersistedUiMeta(): PersistedUiMeta {
  const empty: PersistedUiMeta = {
    folderMeta: {},
    trashedByVault: {},
    shareLinkTokens: {},
    visionBoards: {},
    recents: [],
  };
  if (typeof window === "undefined" || !window.localStorage) return empty;
  try {
    const raw = window.localStorage.getItem(UI_META_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedUiMeta>;
      return {
        folderMeta: parsed.folderMeta ?? {},
        trashedByVault: parsed.trashedByVault ?? {},
        shareLinkTokens: parsed.shareLinkTokens ?? {},
        visionBoards: parsed.visionBoards ?? {},
        look: parsed.look === "paper" ? "paper" : undefined,
        recents: Array.isArray(parsed.recents) ? parsed.recents : [],
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

/** Save the per-browser UI store and hand the value back, for use inside a setState updater. */
export function persistUiMeta(meta: PersistedUiMeta): PersistedUiMeta {
  savePersistedUiMeta(meta);
  return meta;
}

export function resolveFolderUiMeta(
  folder: Folder,
  customMetaMap: Record<string, FolderUiMeta>,
  fallbackIndex = 0,
): FolderUiMeta {
  const custom = customMetaMap[folder.id];
  if (custom) return custom;
  // T026b: Key by folder.kind first so renaming a default folder keeps its icon
  if (folder.kind !== null && DEFAULT_KIND_META[folder.kind]) {
    return DEFAULT_KIND_META[folder.kind];
  }
  // Fallback to folder.name only when folder.kind is null
  const lower = folder.name.trim().toLowerCase();
  if (folder.parentId === null && DEFAULT_ROOT_META[lower]) {
    return DEFAULT_ROOT_META[lower];
  }
  if (folder.parentId !== null && DEFAULT_SUB_META[lower]) {
    return DEFAULT_SUB_META[lower];
  }
  return {
    by: folder.parentId === null ? "custom folder" : "custom subfolder",
    colorSlot: fallbackIndex % 5,
    iconKey: "beats",
    order: 100 + fallbackIndex,
  };
}

/** Cover of a folder: its own saved pick, else its parent's (a default subfolder wears the parent's cover). */
export function resolveFolderCover(
  folder: Folder,
  customMetaMap: Record<string, FolderUiMeta>,
  parent?: Folder | null,
): { color: string; iconKey: string } {
  const meta = resolveFolderUiMeta(customMetaMap[folder.id] || !parent ? folder : parent, customMetaMap);
  return { color: COVER_COLORS[meta.colorSlot % COVER_COLORS.length], iconKey: meta.iconKey };
}

/** Cover of the folder a file sits in; null when that folder is not on screen (In Progress, say). */
export function resolveFileCover(
  file: FileItem,
  roots: Folder[],
  subfoldersByRoot: Record<string, Folder[]>,
  customMetaMap: Record<string, FolderUiMeta>,
): { color: string; iconKey: string } | null {
  for (const root of roots) {
    if (root.id === file.folderId) return resolveFolderCover(root, customMetaMap);
    const sub = (subfoldersByRoot[root.id] ?? []).find((sf) => sf.id === file.folderId);
    if (sub) return resolveFolderCover(sub, customMetaMap, root);
  }
  return null;
}

/** Move `key` to the front of a last-opened list (newest first, capped). */
export function touchRecent(list: string[] | undefined, key: string, cap = 200): string[] {
  return [key, ...(list ?? []).filter((k) => k !== key)].slice(0, cap);
}

// T026b: Sort defaults first in DEFAULT_FOLDERS order, then user folders by name (while respecting a custom drag order)
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
