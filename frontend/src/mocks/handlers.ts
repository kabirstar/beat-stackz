import { http, HttpResponse, type HttpHandler } from "msw";
import { createHandlers, MOCK_API, MOCK_BUCKET, seed, type Store } from "@bpackz/shared/mocks";
import type { FolderKind } from "@bpackz/shared";

const MSW_STORAGE_KEY = "bpackz_msw_store_v2";

/** Generate a valid 6-second warm studio synth chord WAV buffer so <audio> playback works natively in mock mode. */
function createMockWavBuffer(durationSec = 6, sampleRate = 22050): Uint8Array {
  const numSamples = durationSec * sampleRate;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
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

  const freqs = [174.61, 220.0, 261.63, 329.63];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const beatEnv = 0.65 + 0.35 * Math.sin(2 * Math.PI * 2 * t);
    const fadeOut = Math.min(1, (durationSec - t) / 0.4);
    const fadeIn = Math.min(1, t / 0.1);
    let sample = 0;
    for (const f of freqs) {
      sample += Math.sin(2 * Math.PI * f * t);
    }
    const normalized = (sample / freqs.length) * 0.35 * beatEnv * fadeIn * fadeOut;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, normalized)) * 32767, true);
  }

  return new Uint8Array(buffer);
}

const mockWavBytes = createMockWavBuffer();

const fakeSha = (s: string) =>
  Array.from(s)
    .map((c) => c.charCodeAt(0).toString(16))
    .join("")
    .padEnd(64, "0")
    .slice(0, 64);

export const DEFAULT_VAULT_TAXONOMY: {
  slug: string;
  name: string;
  desc: string;
  colorSlot: number;
  subfolders: { slug: string; name: string; desc: string; colorSlot: number }[];
}[] = [
  {
    slug: "beats",
    name: "beats",
    desc: "instrumentals & loops",
    colorSlot: 0,
    subfolders: [],
  },
  {
    slug: "presets",
    name: "presets",
    desc: "plugin · vocals",
    colorSlot: 1,
    subfolders: [
      { slug: "plugin", name: "plugin", desc: "vst patches & fx", colorSlot: 0 },
      { slug: "vocals", name: "vocals", desc: "vocal chains & throws", colorSlot: 1 },
    ],
  },
  {
    slug: "vocals",
    name: "vocals",
    desc: "main · adlib · bg",
    colorSlot: 2,
    subfolders: [
      { slug: "main", name: "main", desc: "lead vocal takes", colorSlot: 0 },
      { slug: "adlib", name: "adlib", desc: "hype throws & fx", colorSlot: 1 },
      { slug: "bg", name: "bg", desc: "harmonies & stacks", colorSlot: 2 },
    ],
  },
  {
    slug: "songs",
    name: "songs",
    desc: "demo · mix · drop",
    colorSlot: 3,
    subfolders: [
      { slug: "demo", name: "demo", desc: "rough bounces", colorSlot: 0 },
      { slug: "mix", name: "mix", desc: "mix revisions", colorSlot: 1 },
      { slug: "drop", name: "drop", desc: "final masters", colorSlot: 2 },
    ],
  },
  {
    slug: "media",
    name: "media",
    desc: "photos · videos · covers",
    colorSlot: 4,
    subfolders: [
      { slug: "photos", name: "photos", desc: "stills & press shots", colorSlot: 0 },
      { slug: "videos", name: "videos", desc: "reels & teasers", colorSlot: 1 },
      { slug: "mv", name: "music video", desc: "master cuts", colorSlot: 2 },
      { slug: "bts", name: "bts", desc: "behind the scenes", colorSlot: 3 },
      { slug: "covers", name: "album covers", desc: "cover art & sleeves", colorSlot: 4 },
    ],
  },
  {
    slug: "vision_board",
    name: "vision board",
    desc: "notes · songs · threads",
    colorSlot: 0,
    subfolders: [],
  },
];

export function ensureVaultHasTaxonomy(store: Store, vaultId: string, creatorId: string) {
  const nowIso = new Date().toISOString();
  for (const rootSpec of DEFAULT_VAULT_TAXONOMY) {
    let rootFolder = store.folders.find(
      (f) =>
        f.vaultId === vaultId &&
        f.parentId === null &&
        f.name.toLowerCase() === rootSpec.name.toLowerCase(),
    );
    if (!rootFolder) {
      rootFolder = {
        id: `fo_${vaultId}_${rootSpec.slug}`,
        vaultId,
        parentId: null,
        name: rootSpec.name,
        kind: rootSpec.slug as FolderKind, // ADR 0002 (Blue, T026): kind = slug path
        createdBy: creatorId,
        updatedAt: nowIso,
      };
      store.folders.push(rootFolder);
    }
    for (const subSpec of rootSpec.subfolders) {
      const existingSub = store.folders.find(
        (f) =>
          f.vaultId === vaultId &&
          f.parentId === rootFolder!.id &&
          f.name.toLowerCase() === subSpec.name.toLowerCase(),
      );
      if (!existingSub) {
        store.folders.push({
          id: `fo_${vaultId}_${rootSpec.slug}_${subSpec.slug}`,
          vaultId,
          parentId: rootFolder.id,
          name: subSpec.name,
          kind: `${rootSpec.slug}/${subSpec.slug}` as FolderKind,
          createdBy: creatorId,
          updatedAt: nowIso,
        });
      }
    }
  }
}

function seedSwishAndTodoVaults(store: Store) {
  const nowIso = new Date().toISOString();

  // Set primary users to Swish and Todo while preserving IDs u_me and u_prod
  const swishUser = store.users.find((u) => u.id === "u_me");
  if (swishUser) {
    swishUser.name = "Swish";
    swishUser.email = "swish@bpackz.studio";
  }
  const todoUser = store.users.find((u) => u.id === "u_prod");
  if (todoUser) {
    todoUser.name = "Todo";
    todoUser.email = "todo@bpackz.studio";
  }
  if (store.me.id === "u_me" && swishUser) {
    store.me = swishUser;
  }

  // Name personal & shared vaults
  const swishVault = store.vaults.find((v) => v.id === "v_personal");
  if (swishVault) {
    swishVault.name = "Swish";
  }
  const sharedVault = store.vaults.find((v) => v.id === "v_shared");
  if (sharedVault) {
    sharedVault.name = "Swish × Todo";
  }

  // Ensure Todo has a personal vault
  let todoVault = store.vaults.find(
    (v) =>
      v.kind === "personal" &&
      store.members.some((m) => m.vaultId === v.id && m.userId === "u_prod" && m.role === "owner"),
  );
  if (!todoVault) {
    todoVault = {
      id: "v_personal_u_prod",
      kind: "personal",
      name: "Todo",
      createdAt: nowIso,
    };
    store.vaults.push(todoVault);
    store.members.push({ vaultId: todoVault.id, userId: "u_prod", role: "owner" });
  } else {
    todoVault.name = "Todo";
  }

  // Remove generic seed folders so vaults start with the 5 approved 3D studio hardware folders
  store.folders = store.folders.filter(
    (f) => !["fo_stems", "fo_masters", "fo_art"].includes(f.id),
  );

  // Ensure all vaults have the 5 root record folders & subfolders
  for (const v of store.vaults) {
    const owner = store.members.find((m) => m.vaultId === v.id && m.role === "owner");
    ensureVaultHasTaxonomy(store, v.id, owner?.userId ?? "u_me");
  }

  // Add starter files into the taxonomy folders if not already present
  const addStarterFile = (
    id: string,
    vaultId: string,
    folderId: string,
    name: string,
    size: number,
    mime: string,
    durationMs: number | null,
    createdBy: string,
  ) => {
    if (!store.files.some((f) => f.id === id)) {
      store.files.push({
        id,
        vaultId,
        folderId,
        name,
        status: "ready",
        size,
        mime,
        sha256: fakeSha(id),
        durationMs,
        hasWaveform: durationMs !== null,
        createdBy,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
  };

  // Swish starter files
  addStarterFile("fi_sw_b1", "v_personal", "fo_v_personal_beats", "142bpm_obsidian_synth.wav", 48_000_000, "audio/wav", 182_000, "u_me");
  addStarterFile("fi_sw_b2", "v_personal", "fo_v_personal_beats", "swish_bounce_808_v3.wav", 52_000_000, "audio/wav", 194_000, "u_me");
  addStarterFile("fi_sw_pp1", "v_personal", "fo_v_personal_presets_plugin", "halo_sub_brass_09.fxp", 1_200_000, "application/octet-stream", null, "u_me");
  addStarterFile("fi_sw_pv1", "v_personal", "fo_v_personal_presets_vocals", "swish_lead_vox_chain.fst", 2_400_000, "application/octet-stream", null, "u_me");
  addStarterFile("fi_sw_vm1", "v_personal", "fo_v_personal_vocals_main", "nightfall_hook_lead.wav", 44_000_000, "audio/wav", 176_000, "u_me");
  addStarterFile("fi_sw_va1", "v_personal", "fo_v_personal_vocals_adlib", "adlibs_stereo_throw.wav", 31_000_000, "audio/wav", 142_000, "u_me");
  addStarterFile("fi_sw_vb1", "v_personal", "fo_v_personal_vocals_bg", "hook_harmony_high_L.wav", 29_000_000, "audio/wav", 140_000, "u_me");
  addStarterFile("fi_sw_sd1", "v_personal", "fo_v_personal_songs_demo", "nightfall_rough_demo.mp3", 8_400_000, "audio/mpeg", 168_000, "u_me");
  addStarterFile("fi_sw_sm1", "v_personal", "fo_v_personal_songs_mix", "nightfall_mix_v2.wav", 51_000_000, "audio/wav", 188_000, "u_me");
  addStarterFile("fi_sw_sdr1", "v_personal", "fo_v_personal_songs_drop", "NIGHTFALL_MASTER.wav", 54_000_000, "audio/wav", 190_500, "u_me");
  addStarterFile("fi_sw_mp1", "v_personal", "fo_v_personal_media_photos", "studio_polaroid_01.jpg", 6_200_000, "image/jpeg", null, "u_me");
  addStarterFile("fi_sw_mv1", "v_personal", "fo_v_personal_media_videos", "nightfall_snippet_9x16.mp4", 88_000_000, "video/mp4", null, "u_me");
  addStarterFile("fi_sw_mmv1", "v_personal", "fo_v_personal_media_mv", "NIGHTFALL_MV_4K.mov", 420_000_000, "video/quicktime", null, "u_me");
  addStarterFile("fi_sw_mbts1", "v_personal", "fo_v_personal_media_bts", "making_nightfall.mp4", 210_000_000, "video/mp4", null, "u_me");
  addStarterFile("fi_sw_mc1", "v_personal", "fo_v_personal_media_covers", "NIGHTFALL_COVER.png", 18_000_000, "image/png", null, "u_me");

  // Todo starter files
  addStarterFile("fi_td_b1", todoVault.id, `fo_${todoVault.id}_beats`, "todo_analog_tape_loop.wav", 39_000_000, "audio/wav", 160_000, "u_prod");
  addStarterFile("fi_td_pp1", todoVault.id, `fo_${todoVault.id}_presets_plugin`, "todo_serum_lead_bank.fxp", 1_800_000, "application/octet-stream", null, "u_prod");
  addStarterFile("fi_td_vm1", todoVault.id, `fo_${todoVault.id}_vocals_main`, "todo_verse2_vox_raw.wav", 41_000_000, "audio/wav", 172_000, "u_prod");
  addStarterFile("fi_td_sd1", todoVault.id, `fo_${todoVault.id}_songs_demo`, "todo_late_idea_v1.mp3", 7_200_000, "audio/mpeg", 150_000, "u_prod");

  // Shared Vault starter files
  addStarterFile("fi_sh_b1", "v_shared", "fo_v_shared_beats", "swish_x_todo_collab_beat.wav", 50_000_000, "audio/wav", 185_000, "u_me");
  addStarterFile("fi_sh_vm1", "v_shared", "fo_v_shared_vocals_main", "collab_hook_stems.wav", 46_000_000, "audio/wav", 178_000, "u_prod");
  addStarterFile("fi_sh_sm1", "v_shared", "fo_v_shared_songs_mix", "swish_x_todo_mix_v1.wav", 52_000_000, "audio/wav", 190_000, "u_me");
}

function loadPersistedStore(fallback: Store): Store {
  if (typeof window === "undefined" || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(MSW_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Store;
      if (parsed && Array.isArray(parsed.vaults) && Array.isArray(parsed.folders)) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return fallback;
}

export function savePersistedStore(store: Store) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(MSW_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage errors
  }
}

export interface MockAuthSession {
  store: Store;
  isSignedIn: () => boolean;
  setSignedIn: (val: boolean) => void;
}

export function createFrontendMockHandlers(
  initialStore?: Store,
  startSignedIn = true,
): { handlers: HttpHandler[]; session: MockAuthSession } {
  const baseStore = initialStore ?? loadPersistedStore(seed());
  seedSwishAndTodoVaults(baseStore);
  if (!initialStore) {
    savePersistedStore(baseStore);
  }

  const store = baseStore;
  let signedIn = startSignedIn;
  let userSeq = 10;

  function prioritizeUserPersonalVault(userId: string) {
    const idx = store.vaults.findIndex(
      (v) =>
        v.kind === "personal" &&
        store.members.some((m) => m.vaultId === v.id && m.userId === userId && m.role === "owner"),
    );
    if (idx > 0) {
      const [pv] = store.vaults.splice(idx, 1);
      store.vaults.unshift(pv);
    }
  }

  const authHandlers: HttpHandler[] = [
    http.get(`${MOCK_API}/me`, () => {
      if (!signedIn) {
        return HttpResponse.json(
          { error: "unauthorized", message: "Sign in required" },
          { status: 401 },
        );
      }
      prioritizeUserPersonalVault(store.me.id);
      const personalVault = store.vaults.find((v) => v.kind === "personal")!;
      return HttpResponse.json({
        user: store.me,
        personalVaultId: personalVault.id,
      });
    }),

    http.get(`${MOCK_API}/auth/get-session`, () => {
      if (!signedIn) {
        return HttpResponse.json(null, { status: 200 });
      }
      return HttpResponse.json({ user: store.me }, { status: 200 });
    }),

    http.post(`${MOCK_API}/auth/sign-in/email`, async ({ request }) => {
      const body = (await request.json().catch(() => null)) as {
        email?: string;
        password?: string;
      } | null;
      const email = body?.email?.trim().toLowerCase();
      const password = body?.password ?? "";

      if (!email || !password) {
        return HttpResponse.json(
          { error: "invalid", message: "Email and password are required" },
          { status: 400 },
        );
      }

      // Support both swish@bpackz.studio / artist@bpackz.test and todo@bpackz.studio / producer@bpackz.test
      const existing = store.users.find(
        (u) =>
          u.email.toLowerCase() === email ||
          (email === "artist@bpackz.test" && u.id === "u_me") ||
          (email === "swish@bpackz.studio" && u.id === "u_me") ||
          (email === "producer@bpackz.test" && u.id === "u_prod") ||
          (email === "todo@bpackz.studio" && u.id === "u_prod"),
      );
      if (!existing) {
        return HttpResponse.json(
          { error: "unauthorized", message: "Invalid email or password" },
          { status: 401 },
        );
      }

      store.me = existing;
      prioritizeUserPersonalVault(existing.id);
      signedIn = true;
      if (!initialStore) savePersistedStore(store);
      return HttpResponse.json({ user: existing }, { status: 200 });
    }),

    http.post(`${MOCK_API}/auth/sign-up/email`, async ({ request }) => {
      const body = (await request.json().catch(() => null)) as {
        name?: string;
        email?: string;
        password?: string;
      } | null;
      const name = body?.name?.trim() || null;
      const email = body?.email?.trim().toLowerCase();
      const password = body?.password ?? "";

      if (!email || !password || password.length < 6) {
        return HttpResponse.json(
          {
            error: "invalid",
            message: "Valid email and password (min 6 chars) are required",
          },
          { status: 400 },
        );
      }

      if (store.users.some((u) => u.email.toLowerCase() === email)) {
        return HttpResponse.json(
          { error: "conflict", message: "An account with this email already exists" },
          { status: 422 },
        );
      }

      const nowIso = new Date().toISOString();
      const newUser = {
        id: `u_${++userSeq}`,
        email,
        name: name ?? email.split("@")[0],
        createdAt: nowIso,
      };
      const personalVault = {
        id: `v_personal_${newUser.id}`,
        kind: "personal" as const,
        name: newUser.name,
        createdAt: nowIso,
      };

      store.users.push(newUser);
      store.vaults.unshift(personalVault);
      store.members.push({
        vaultId: personalVault.id,
        userId: newUser.id,
        role: "owner",
      });
      ensureVaultHasTaxonomy(store, personalVault.id, newUser.id);

      store.me = newUser;
      signedIn = true;
      if (!initialStore) savePersistedStore(store);
      return HttpResponse.json({ user: newUser }, { status: 200 });
    }),

    http.post(`${MOCK_API}/auth/sign-out`, () => {
      signedIn = false;
      return HttpResponse.json({ ok: true }, { status: 200 });
    }),

    http.get(`${MOCK_BUCKET}/*`, () => {
      return new HttpResponse(mockWavBytes, {
        status: 200,
        headers: {
          "content-type": "audio/wav",
          "content-length": String(mockWavBytes.byteLength),
          "accept-ranges": "bytes",
        },
      });
    }),
  ];

  const sharedHandlers = createHandlers(store);

  return {
    handlers: [...authHandlers, ...sharedHandlers],
    session: {
      store,
      isSignedIn: () => signedIn,
      setSignedIn: (val: boolean) => {
        signedIn = val;
      },
    },
  };
}
