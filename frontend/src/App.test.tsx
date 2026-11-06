import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BottomTransportPlayer } from "./components/BottomTransportPlayer.tsx";
import {
  CreateFolderModal,
  ShareContextSheet,
  ShareLinkRow,
} from "./components/VaultModals.tsx";
import { formatBytes, parseStudioFileDisplay } from "./App.tsx";
import { computeBlobSha256, createSampleWavBlob, showUploadedFile } from "./utils/format.ts";
import { countFiles, formatDuration, TrackRow } from "./components/StudioFileSection.tsx";
import { folderIconName } from "./components/StudioPrimitives.tsx";
import {
  buildLibraryItems,
  filesUnder,
  type LibraryPill,
} from "./components/LibraryPanel.tsx";
import {
  describeFolderCard,
  nextWho,
  searchFiles,
  VaultWorkspace,
  type VaultWorkspaceProps,
} from "./components/VaultWorkspace.tsx";
import type { FileItem, Folder, Vault, VaultMember } from "@bpackz/shared";
import {
  COVER_COLORS,
  describeFileMeta,
  ICON_TYPES,
  loadPersistedUiMeta,
  persistUiMeta,
  resolveFileOwnerName,
  resolveFolderCover,
  resolveFolderUiMeta,
  sortVaultFolders,
  touchRecent,
} from "./vaultTheme.ts";
import {
  isVaultPasscodeValid,
  maskWithAsterisks,
  VaultGateScreen,
} from "./components/VaultGateScreen.tsx";
import {
  classifyFlStudioStem,
  IN_PROGRESS_BUCKETS,
  inferSongTitleFromBatch,
} from "./utils/inProgressAutoRouter.ts";

describe("The Vault UI & Theme Specification (T020 & T021)", () => {
  it("parses studio filenames into clean Studio Mono titles and format badges", () => {
    const parsed = parseStudioFileDisplay("swish_142bpm_dark_loop.wav");
    assert.equal(parsed.cleanTitle, "Swish 142bpm Dark Loop");
    assert.equal(parsed.ext, "WAV");
    assert.equal(parsed.isAudio, true);

    const videoParsed = parseStudioFileDisplay("night_session_cut_v2.mp4");
    assert.equal(videoParsed.cleanTitle, "Night Session Cut V2");
    assert.equal(videoParsed.ext, "MP4");
    assert.equal(videoParsed.isAudio, false);
  });

  it("resolves default 3D hardware icon metadata for root folders and subfolders", () => {
    const vocalsMeta = resolveFolderUiMeta(
      {
        id: "f_root_vocals",
        vaultId: "v_personal",
        parentId: null,
        name: "vocals",
        kind: "vocals",
        createdBy: "u_artist",
        updatedAt: "2026-10-21T00:00:00.000Z",
      },
      {},
    );
    assert.equal(vocalsMeta.iconKey, "vocals");
    assert.equal(vocalsMeta.by, "main · adlib · bg");

    const mvMeta = resolveFolderUiMeta(
      {
        id: "f_sub_mv",
        vaultId: "v_personal",
        parentId: "f_root_media",
        name: "music video",
        kind: "media/mv",
        createdBy: "u_artist",
        updatedAt: "2026-10-21T00:00:00.000Z",
      },
      {},
    );
    assert.equal(mvMeta.iconKey, "sub_mv");

    const sharedBeatsMeta = resolveFolderUiMeta(
      {
        id: "f_shared_beats",
        vaultId: "v_shared",
        parentId: null,
        name: "beats",
        kind: "beats",
        createdBy: "u_artist",
        updatedAt: "2026-10-21T00:00:00.000Z",
      },
      {},
    );
    assert.equal(sharedBeatsMeta.iconKey, "beats"); // TOD-108: a shared vault keeps the same covers

    // T026b: Renaming a default folder preserves its 3D icon via folder.kind
    const renamedBeatsMeta = resolveFolderUiMeta(
      {
        id: "f_renamed_beats",
        vaultId: "v_personal",
        parentId: null,
        name: "808 loops & packs",
        kind: "beats",
        createdBy: "u_artist",
        updatedAt: "2026-10-21T00:00:00.000Z",
      },
      {},
    );
    assert.equal(renamedBeatsMeta.iconKey, "beats");

    // T026b: sortVaultFolders places DEFAULT_FOLDERS first in canonical order, then user folders by name
    const sorted = sortVaultFolders([
      {
        id: "f_user_z",
        vaultId: "v_personal",
        parentId: null,
        name: "zebra custom",
        kind: null,
        createdBy: "u_artist",
        updatedAt: "2026-10-21T00:00:00.000Z",
      },
      {
        id: "f_media",
        vaultId: "v_personal",
        parentId: null,
        name: "media",
        kind: "media",
        createdBy: "u_artist",
        updatedAt: "2026-10-21T00:00:00.000Z",
      },
      {
        id: "f_user_a",
        vaultId: "v_personal",
        parentId: null,
        name: "alpha stems",
        kind: null,
        createdBy: "u_artist",
        updatedAt: "2026-10-21T00:00:00.000Z",
      },
      {
        id: "f_beats",
        vaultId: "v_personal",
        parentId: null,
        name: "renamed beats",
        kind: "beats",
        createdBy: "u_artist",
        updatedAt: "2026-10-21T00:00:00.000Z",
      },
    ]);
    assert.deepEqual(
      sorted.map((f) => f.id),
      ["f_beats", "f_media", "f_user_a", "f_user_z"],
    );
  });

  it("Vault Gate door accepts any non-empty code (server enforces INVITE_CODE) and masks typed characters as '*'", () => {
    assert.equal(isVaultPasscodeValid("swish"), true);
    assert.equal(isVaultPasscodeValid(" anything "), true);
    assert.equal(isVaultPasscodeValid(""), false);
    assert.equal(isVaultPasscodeValid("   "), false);
    assert.equal(maskWithAsterisks("swish"), "*****");
  });

  it("TOD-104 invite code box is a real visible text input: typed characters, caret and focus ring show on a phone", () => {
    const noop = () => {};
    const html = renderToStaticMarkup(
      <VaultGateScreen
        authMode="signup"
        authName=""
        authEmail=""
        authPassword=""
        authError={null}
        inviteCode="made-up-code"
        onChangeMode={noop}
        onChangeName={noop}
        onChangeEmail={noop}
        onChangePassword={noop}
        onSubmitAuth={() => false}
        onUnlock={noop}
      />,
    );
    const input = /<input[^>]*id="vault-invite-code"[^>]*>/.exec(html)?.[0] ?? "";
    assert.match(input, /type="text"/, "characters are shown, not masked");
    assert.match(input, /value="made-up-code"/);
    assert.doesNotMatch(input, /opacity-0/, "the input itself is visible, so the caret is too");
    assert.match(input, /text-base/, "16px so iOS does not zoom");
    assert.match(input, /h-12/, "48px tall touch target");
    assert.match(input, /focus:shadow-/, "visible focus ring");
    assert.match(input, /autoCapitalize="none"/i);
    assert.match(input, /autoCorrect="off"/i);
    assert.match(input, /spellCheck="false"/i);
    assert.match(html, /<label[^>]*for="vault-invite-code"[^>]*>Invite code<\/label>/);
    assert.doesNotMatch(html, /\*{3,}/, "no asterisk stand-in for the invite code");
  });

  it("formats byte sizes and resolves file owner names from vaultMembers or fallback", async () => {
    assert.equal(formatBytes(48_400_000), "46.2 MB");
    assert.equal(resolveFileOwnerName("u_artist"), "Swish");
    assert.equal(resolveFileOwnerName("u_prod"), "Todo");
    assert.equal(
      resolveFileOwnerName("u_real_123", [
        {
          userId: "u_real_123",
          email: "lush@bpackz.studio",
          name: "Lush",
          role: "owner",
        },
      ]),
      "Lush",
    );

    const wav = createSampleWavBlob();
    const digest = await computeBlobSha256(wav, "sample.wav", wav.size);
    assert.match(digest, /^[0-9a-f]{64}$/);

    assert.equal(
      describeFileMeta({
        id: "file_1",
        vaultId: "v_personal",
        folderId: null,
        name: "swish_142bpm_dark_loop.wav",
        status: "processing",
        size: 48_400_000,
        mime: "audio/wav",
        sha256: null,
        durationMs: null,
        hasWaveform: false,
        createdBy: "u_artist",
        createdAt: "2026-10-21T00:00:00.000Z",
        updatedAt: "2026-10-21T00:00:00.000Z",
      }),
      "142 BPM · C MIN",
    );
  });

  it("classifies FL Studio split-mixer exports into beat, main, bg, adlib, demo, and mixed subfolders", () => {
    assert.deepEqual(
      IN_PROGRESS_BUCKETS.map((b) => b.key),
      ["beat", "main", "bg", "adlib", "demo", "mixed"],
    );

    assert.equal(classifyFlStudioStem("Nightfall - Insert 1 - Beat 2Track.wav", 6), "beat");
    assert.equal(classifyFlStudioStem("Nightfall_808_Sub_Bass.wav", 6), "beat");
    assert.equal(classifyFlStudioStem("Nightfall - Main Lead Vocal.wav", 6), "main");
    assert.equal(classifyFlStudioStem("Nightfall_Hook_Vox_Dry.wav", 6), "main");
    assert.equal(classifyFlStudioStem("Nightfall_BG_Harmony_Stack_L.wav", 6), "bg");
    assert.equal(classifyFlStudioStem("Nightfall_Background_Doubles.wav", 6), "bg");
    assert.equal(classifyFlStudioStem("Nightfall_Adlibs_Stereo_Throw.wav", 6), "adlib");
    assert.equal(classifyFlStudioStem("Nightfall_Hype_Ad-Lib.wav", 6), "adlib");
    assert.equal(classifyFlStudioStem("Nightfall_Rough_Demo_Bounce.mp3", 6), "demo");
    assert.equal(classifyFlStudioStem("Nightfall_Session.flp", 6), "demo");
    assert.equal(classifyFlStudioStem("Nightfall_Prod_Mix_v2.wav", 6), "mixed");
    assert.equal(classifyFlStudioStem("Nightfall_Final_Master.wav", 6), "mixed");

    assert.equal(
      inferSongTitleFromBatch(
        [
          "Obsidian Freestyle - Beat.wav",
          "Obsidian Freestyle - Main Vox.wav",
          "Obsidian Freestyle - Adlibs.wav",
        ],
        null,
      ),
      "Obsidian Freestyle",
    );
    assert.equal(
      inferSongTitleFromBatch(["Track1.wav", "Track2.wav"], "Late Night Stems.zip"),
      "Late Night",
    );
  });
});

// The frontend tests run without a DOM, and the player has no hooks, so call it
// as a function and walk the element tree it returns.
function findSeekSlider(node: ReactNode): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findSeekSlider(child);
      if (hit) return hit;
    }
    return null;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const el = node as ReactElement<Record<string, unknown>>;
  if (el.type === "input" && el.props.type === "range") return el;
  return findSeekSlider(el.props.children as ReactNode);
}

describe("Bottom transport player seek slider (TOD-102)", () => {
  const audio = { currentTime: 0, duration: 200 };
  const renderPlayer = (playProgress: number) =>
    BottomTransportPlayer({
      playingFile: {
        id: "file_1",
        vaultId: "v_personal",
        folderId: null,
        name: "nightfall_mix_v2.wav",
        status: "ready",
        size: 51_000_000,
        mime: "audio/wav",
        sha256: null,
        durationMs: 200_000,
        hasWaveform: true,
        createdBy: "u_artist",
        createdAt: "2026-10-21T00:00:00.000Z",
        updatedAt: "2026-10-21T00:00:00.000Z",
      },
      waveformBars: [10, 20, 30],
      playProgress,
      durationSec: audio.duration,
      loopEnabled: false,
      onToggleLoop: () => {},
      // Same arithmetic as App.tsx's onSeek, against a stand-in <audio>.
      onSeek: (pct) => {
        audio.currentTime = (pct / 100) * audio.duration;
      },
      onShare: () => {},
      onDownload: () => {},
      onClose: () => {},
    });

  it("renders a labelled, touch-sized range input that reflects the position and seeks", () => {
    const tree = renderPlayer(25);
    const slider = findSeekSlider(tree);
    assert.ok(slider, "player renders an <input type=range>");
    assert.equal(slider.props["aria-label"], "Seek");
    assert.equal(slider.props.value, 25);
    assert.match(String(slider.props.className), /\bh-11\b/); // 44px touch target

    // Current time and duration sit beside it: 25% of 200s is 0:50 of 3:20.
    const row = JSON.stringify(tree);
    assert.match(row, /"0:50"/);
    assert.match(row, /"3:20"/);

    (slider.props.onChange as (e: { currentTarget: { value: string } }) => void)({
      currentTarget: { value: "60" },
    });
    assert.equal(audio.currentTime, 120);
  });
});

function findButtons(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(findButtons);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as ReactElement<Record<string, unknown>>;
  return [...(el.type === "button" ? [el] : []), ...findButtons(el.props.children as ReactNode)];
}

describe("Share sheet Stop sharing control (TOD-103)", () => {
  const label = "/s/tok_abc";
  const calls: string[] = [];
  const renderRow = (confirming: boolean) =>
    findButtons(
      ShareLinkRow({
        shareId: "sh_1",
        token: "tok_abc",
        confirming,
        onOpen: (tok) => calls.push(`open ${tok}`),
        onConfirming: (id) => calls.push(`confirming ${id}`),
        onStop: (id) => calls.push(`stop ${id}`),
      }),
    );
  const press = (b: ReactElement<Record<string, unknown>>) => (b.props.onClick as () => void)();
  const text = (b: ReactElement<Record<string, unknown>>) => String(b.props.children);

  it("labels the control in words, touch-sized, and asks before revoking", () => {
    const [open, stop] = renderRow(false);
    assert.equal(text(stop), "Stop sharing");
    assert.equal(stop.props["aria-label"], `Stop sharing ${label}`);
    assert.match(String(stop.props.className), /\bmin-h-11\b/); // 44px touch target
    press(stop);
    press(open);
    assert.deepEqual(calls, ["confirming sh_1", "open tok_abc"]); // first tap only opens the confirm step
  });

  it("confirms in the page: Keep link cancels, Yes stops sharing", () => {
    calls.length = 0;
    const [keep, yes] = renderRow(true);
    assert.equal(text(keep), "Keep link");
    assert.equal(text(yes), "Yes, stop sharing");
    press(keep);
    press(yes);
    assert.deepEqual(calls, ["confirming null", "stop sh_1"]);
  });

  it("lists every live link in the share sheet with its own Stop sharing button", () => {
    const share = (id: string) => ({
      id,
      fileId: "file_1",
      granteeUserId: null,
      role: "view" as const,
      expiresAt: null,
      createdBy: "u_artist",
      createdAt: "2026-11-05T00:00:00.000Z",
    });
    const noop = () => {};
    const html = renderToStaticMarkup(
      <ShareContextSheet
        file={{
          id: "file_1",
          vaultId: "v_personal",
          folderId: null,
          name: "kick.wav",
          status: "ready",
          size: 4_000_000,
          mime: "audio/wav",
          sha256: null,
          durationMs: 1000,
          hasWaveform: true,
          createdBy: "u_artist",
          createdAt: "2026-11-05T00:00:00.000Z",
          updatedAt: "2026-11-05T00:00:00.000Z",
        }}
        otherUserName="Todo"
        vaults={[
          {
            id: "v_shared",
            kind: "shared",
            name: "Swish × Todo",
            myRole: "owner",
            createdAt: "2026-11-05T00:00:00.000Z",
          },
        ]}
        uiMeta={loadPersistedUiMeta()}
        shareLinkExpiry="7d"
        activeFileShares={[share("sh_1"), share("sh_2")]}
        onClose={noop}
        onShareToSharedVault={noop}
        onChangeExpiry={noop}
        onCreatePublicShareLink={noop}
        onRevokeShareLink={noop}
        onRenameFile={noop}
        onDownload={noop}
        onSoftDelete={noop}
      />,
    );
    assert.match(html, /aria-label="Stop sharing \/s\/sh_1"/);
    assert.match(html, /aria-label="Stop sharing \/s\/sh_2"/);
    assert.doesNotMatch(html, /title="Revoke"/); // the old unlabelled × is gone
  });
});

describe("Uploaded file shows at once, marked Processing (TOD-105)", () => {
  const file = (id: string, over: Partial<FileItem> = {}): FileItem => ({
    id,
    vaultId: "v_personal",
    folderId: "f_beats",
    name: `${id}.wav`,
    status: "processing",
    size: 4_000_000,
    mime: "audio/wav",
    sha256: null,
    durationMs: null,
    hasWaveform: false,
    createdBy: "u_artist",
    createdAt: "2026-11-05T00:00:00.000Z",
    updatedAt: "2026-11-05T00:00:00.000Z",
    ...over,
  });

  it("puts the row the upload returned into its folder's list without a refetch", () => {
    let list: Record<string, FileItem[]> = { f_beats: [file("old", { status: "ready" })] };
    const set = (update: (prev: typeof list) => typeof list) => {
      list = update(list);
    };
    const uploaded = file("new");

    assert.equal(showUploadedFile(set, uploaded, "v_personal"), uploaded);
    assert.deepEqual(list.f_beats.map((f) => f.id), ["old", "new"]);
    assert.equal(list.f_beats[1], uploaded, "the server's row as is, status processing");

    showUploadedFile(set, file("new", { status: "ready" }), "v_personal");
    assert.deepEqual(list.f_beats.map((f) => f.id), ["old", "new"], "same id is replaced, not doubled");
    assert.equal(list.f_beats[1].status, "ready");

    showUploadedFile(set, file("at_root", { folderId: null }), "v_personal");
    assert.deepEqual(list.root.map((f) => f.id), ["at_root"]);

    const before = list;
    showUploadedFile(set, file("elsewhere", { vaultId: "v_shared" }), "v_personal");
    assert.equal(list, before, "a file sent to another vault stays out of this vault's list");
  });

  it("a processing row says Processing and offers no play; ready does", () => {
    const noop = () => {};
    const row = (status: FileItem["status"]) =>
      renderToStaticMarkup(
        <TrackRow
          file={file("take_1", { status })}
          idx={0}
          playingFileId={null}
          onTogglePlay={noop}
          onOpenPopover={noop}
        />,
      );
    const processing = row("processing");
    assert.match(processing, /Processing/);
    assert.match(processing, /take_1\.wav/);
    assert.doesNotMatch(processing, /title="Play"/);

    const ready = row("ready");
    assert.doesNotMatch(ready, /Processing/);
    assert.match(ready, /title="Play"/);
  });
});

// ───── Vault home redesign (TOD-108) ─────
// No DOM here, so hook-free components are called as functions and their element trees walked.

const HOOKED = new Set(["CoverGridSection", "InProgressSection", "VisionBoardCanvas"]);

/** One stand-in argument that every handler in the vault home accepts (event, folder, file, library item). */
const anyArg = {
  id: "f_beats",
  key: "go:f_beats",
  action: "go",
  parentId: null,
  name: "x",
  kind: null,
  createdBy: "u_artist",
  preventDefault: () => {},
  target: { value: "x" },
  currentTarget: { value: "50", elements: { namedItem: () => ({ value: "Renamed" }) } },
};

/** Calls every function prop in the tree (expanding hook-free components) so each control proves it is wired. */
function fireAll(node: ReactNode): void {
  if (Array.isArray(node)) return node.forEach(fireAll);
  if (!node || typeof node !== "object" || !("props" in node)) return;
  const el = node as ReactElement<Record<string, unknown>>;
  for (const [key, value] of Object.entries(el.props)) {
    if (key === "children") fireAll(value as ReactNode);
    else if (typeof value === "function") (value as (...a: unknown[]) => unknown)(anyArg, null);
  }
  if (typeof el.type === "function" && !HOOKED.has(el.type.name)) {
    fireAll((el.type as (p: unknown) => ReactNode)(el.props));
  }
}

describe("Vault home redesign (TOD-108)", () => {
  const at = "2026-11-05T00:00:00.000Z";
  const folder = (id: string, over: Partial<Folder> = {}): Folder => ({
    id,
    vaultId: "v_personal",
    parentId: null,
    name: id,
    kind: null,
    createdBy: "u_artist",
    updatedAt: at,
    ...over,
  });
  const track = (id: string, over: Partial<FileItem> = {}): FileItem => ({
    id,
    vaultId: "v_personal",
    folderId: "f_beats",
    name: `${id}.wav`,
    status: "ready",
    size: 4_000_000,
    mime: "audio/wav",
    sha256: null,
    durationMs: 200_000,
    hasWaveform: true,
    createdBy: "u_artist",
    createdAt: at,
    updatedAt: at,
    ...over,
  });
  const user = { id: "u_artist", email: "artist@bpackz.test", name: "Swish", createdAt: at };
  const personal: Vault = { id: "v_personal", kind: "personal", name: "Swish Vault", myRole: "owner", createdAt: at };
  const shared: Vault = { id: "v_shared", kind: "shared", name: "Summer Tape", myRole: "owner", createdAt: at };
  const members: VaultMember[] = [
    { userId: "u_artist", email: "artist@bpackz.test", name: "Swish", role: "owner" },
    { userId: "u_prod", email: "todo@bpackz.test", name: null, role: "editor" },
  ];
  const beats = folder("f_beats", { name: "beats", kind: "beats" });
  const stems = folder("f_stems", { name: "stems", parentId: "f_beats" });
  const emptySub = folder("f_empty", { name: "drafts", parentId: "f_beats" });
  const custom = folder("f_custom", { name: "contracts" });
  const board = folder("__vision_board__", { name: "vision board" });
  const roots = [beats, custom, board];
  const subfoldersByRoot = { f_beats: [stems, emptySub] };
  const filesByFolder = {
    f_beats: [track("kick"), track("take", { status: "processing", durationMs: null })],
    f_stems: [track("snare", { createdBy: "u_prod" }), track("bad", { status: "failed" })],
    f_custom: [track("deal", { name: "deal.pdf", mime: "application/pdf", durationMs: null })],
  };

  it("keeps Night and Paper as CSS variables and respects reduced motion", () => {
    const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
    assert.match(css, /:root,\s*\[data-look="night"\]\s*\{[^}]*--base:\s*#0b0a12/);
    assert.match(css, /\[data-look="paper"\]\s*\{[^}]*--base:\s*#d6d1c6/);
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.doesNotMatch(css, /objectSpawn|lambo/, "the 3D icon spawn animation is gone");
  });

  it("covers use the seven fixed colours; a default subfolder wears its parent's cover", () => {
    assert.equal(COVER_COLORS.length, 7);
    assert.deepEqual(resolveFolderCover(beats, {}), { color: "#ee6a4a", iconKey: "beats" });
    assert.deepEqual(resolveFolderCover(stems, {}, beats), { color: "#ee6a4a", iconKey: "beats" });
    const picked = { f_stems: { by: "mine", colorSlot: 2, iconKey: "rap_cup", order: 1 } };
    assert.deepEqual(resolveFolderCover(stems, picked, beats), { color: "#3fbf9f", iconKey: "rap_cup" });
    assert.equal(folderIconName("rap_cup"), "cup");
    assert.equal(folderIconName("rap_car"), "vault", "an icon that no longer exists falls back");
    assert.ok(ICON_TYPES.every((t) => folderIconName(t.key) !== "vault"));
  });

  it("shows a track's length from durationMs and a dash when the server has none", () => {
    assert.equal(formatDuration(200_000), "3:20");
    assert.equal(formatDuration(59_999), "0:59");
    assert.equal(formatDuration(null), "–");
    assert.equal(formatDuration(undefined), "–");
    const noop = () => {};
    const row = (f: FileItem) =>
      renderToStaticMarkup(<TrackRow file={f} idx={0} playingFileId={null} onTogglePlay={noop} onOpenPopover={noop} />);
    assert.match(row(track("kick")), /class="bs-du">3:20</);
    assert.match(row(track("take", { durationMs: null })), /class="bs-du">–</);
  });

  it("keeps last-opened and theme in the per-browser UI store", () => {
    assert.deepEqual(touchRecent(undefined, "go:a"), ["go:a"]);
    assert.deepEqual(touchRecent(["go:a", "play:b"], "play:b"), ["play:b", "go:a"]);
    assert.deepEqual(touchRecent(["a", "b"], "c", 2), ["c", "a"]);
    const meta = { ...loadPersistedUiMeta(), look: "paper" as const };
    assert.equal(persistUiMeta(meta), meta);
    assert.equal(loadPersistedUiMeta().look, undefined, "Night is the default");
  });

  it("orders the library by last opened and filters it with the pills", () => {
    const build = (pill: LibraryPill | null, recents: string[] = []) =>
      buildLibraryItems({ roots, subfoldersByRoot, filesByFolder, vaults: [personal, shared], folderMeta: {}, recents, pill, vaultMembers: members, user });
    assert.deepEqual(
      build(null).map((i) => i.key),
      ["go:f_beats", "go:f_custom", "go:__vision_board__", "vault:v_personal", "vault:v_shared"],
      "never opened: folders then vaults, in their own order",
    );
    assert.deepEqual(
      build(null, ["play:snare", "vault:v_shared", "go:f_stems"]).map((i) => i.key).slice(0, 4),
      ["play:snare", "vault:v_shared", "go:f_stems", "go:f_beats"],
      "opened items first, newest first, including the subfolder and file that were opened",
    );
    assert.deepEqual(build("vaults").map((i) => i.name), ["Swish Vault", "Summer Tape"]);
    assert.deepEqual(build("folders").map((i) => i.id), ["f_beats", "f_custom", "__vision_board__", "f_stems", "f_empty"]);
    const files = build("files");
    assert.equal(files.length, 5);
    assert.deepEqual([files[2].name, files[2].sub, files[2].icon], ["Snare", "WAV · todo", "songs"]);
    assert.equal(build("folders")[0].sub, "Folder · 4 files");
    assert.equal(filesUnder(beats, subfoldersByRoot, filesByFolder), 4);
    assert.equal(describeFolderCard(beats, {}, subfoldersByRoot, filesByFolder), "instrumentals & loops · 4 files");
    assert.equal(describeFolderCard(board, {}, subfoldersByRoot, filesByFolder), "notes · songs · threads");
    assert.equal(countFiles(1), "1 file");
  });

  it("searches the whole vault and cycles the who filter", () => {
    assert.deepEqual(searchFiles(filesByFolder, "").length, 0);
    assert.deepEqual(searchFiles(filesByFolder, "sna").map((f) => f.id), ["snare"]);
    assert.deepEqual(searchFiles(filesByFolder, "pdf").map((f) => f.id), ["deal"]);
    assert.equal(nextWho(null, ["Swish", "todo"]), "Swish");
    assert.equal(nextWho("Swish", ["Swish", "todo"]), "todo");
    assert.equal(nextWho("todo", ["Swish", "todo"]), null);
  });

  const calls: string[] = [];
  const base = {
    user,
    authLoading: false,
    toast: null,
    look: "night",
    uiMeta: { ...loadPersistedUiMeta(), recents: ["go:f_stems"] },
    vaults: [personal, shared],
    activeVault: personal,
    isSharedMode: false,
    vaultMembers: [],
    roots,
    subfoldersByRoot,
    filesByFolder,
    currentRootFolder: null,
    currentSubFolder: null,
    currentSubfolders: [],
    trashedList: [],
    viewingTrash: false,
    viewingInProgress: false,
    viewingVisionBoard: false,
    search: "",
    whoFilter: null,
    fileLayout: "cards",
    libraryPill: null,
    sharedOpen: false,
    profileOpen: false,
    plusMenuOpen: false,
    inviteEmail: "",
    inviteRole: "editor",
    playingFile: null,
    isPaused: false,
    playProgress: 0,
    inProgressSongs: [],
    activeInProgressSongId: null,
    activeInProgressBucket: "all",
    inProgressImporting: false,
    inProgressStatusText: null,
    lastRouteSummary: null,
    visionBoard: { notes: [], fileNodes: [] },
  };
  /** Workspace props: `base`, the overrides, and a recording stand-in for every handler and setter. */
  const props = (over: Partial<VaultWorkspaceProps> = {}) =>
    new Proxy({ ...base, ...over } as unknown as VaultWorkspaceProps, {
      get: (target, key) =>
        key in target || typeof key !== "string" || !/^(on|set)[A-Z]/.test(key)
          ? target[key as keyof VaultWorkspaceProps]
          : () => calls.push(key),
    });
  const html = (over?: Partial<VaultWorkspaceProps>) => renderToStaticMarkup(VaultWorkspace(props(over)));
  const fired = (over?: Partial<VaultWorkspaceProps>) => {
    calls.length = 0;
    fireAll(VaultWorkspace(props(over)));
    return new Set(calls);
  };

  it("home: top bar, library, folder covers, dock, with every control labelled", () => {
    const home = html();
    assert.match(home, /<h1 class="bs-h1">The Vault<\/h1>/);
    assert.match(home, /Personal vault · Swish/);
    assert.match(home, /aria-label="Search this vault"/);
    assert.match(home, /aria-label="Your vault"/);
    assert.match(home, /Last opened first/);
    assert.match(home, /aria-label="Mobile Navigation Dock"/);
    assert.match(home, /instrumentals &amp; loops · 4 files/);
    assert.match(home, /aria-label="Profile, theme and sign out"/);
    assert.doesNotMatch(home, /aria-label="Shared"[^>]*aria-pressed="true"/);
    assert.doesNotMatch(home, /3D/);
    for (const m of home.matchAll(/<button[^>]*>(.*?)<\/button>/gs)) {
      assert.ok(/aria-label=/.test(m[0]) || m[1].replace(/<svg.*?<\/svg>|<[^>]+>/gs, "").trim(), `unlabelled: ${m[0]}`);
    }

    const did = fired();
    for (const name of ["onGoVaultHome", "onOpenFolder", "onSwitchVault", "setSearch", "setLibraryPill", "setPlusMenuOpen", "setProfileOpen", "setSharedOpen", "setInProgressOpen", "setVisionBoardOpen", "setViewingTrash"]) {
      assert.ok(did.has(name), `${name} is reachable from the home screen`);
    }
  });

  it("the Shared panel does everything the collaborators modal and vault dropdown did", () => {
    const mine = html({ sharedOpen: true });
    assert.match(mine, /Personal vault · only you/);
    assert.match(mine, /Work on files with your crew\./);
    assert.match(mine, /Create new shared vault/);
    assert.doesNotMatch(mine, /Invite collaborator email/);

    const crew = { sharedOpen: true, activeVault: shared, isSharedMode: true, vaultMembers: members };
    const theirs = html(crew);
    assert.match(theirs, /Shared vault · 2 people/);
    assert.match(theirs, /Shared vault · Swish, todo/);
    assert.match(theirs, /aria-label="Invite collaborator email"/);
    assert.match(theirs, /owner · full access/);
    assert.match(theirs, /editor · full edit &amp; dl/);
    assert.match(theirs, /aria-label="Remove todo"/);
    assert.doesNotMatch(theirs, /aria-label="Remove Swish"/, "the owner cannot be removed");
    assert.match(theirs, /aria-label="Vault name"/);

    const did = fired(crew);
    for (const name of ["onInviteMember", "onRemoveMember", "onRenameVault", "onSwitchVault", "setInviteEmail", "setInviteRole", "setCreatingSharedVault", "setSharedOpen"]) {
      assert.ok(did.has(name), `${name} is reachable from the Shared panel`);
    }
  });

  it("a folder opens as album sections with its tracks, filters and folder actions", () => {
    const open = { currentRootFolder: beats, currentSubfolders: [stems, emptySub], vaultMembers: members };
    const page = html({ ...open, playingFile: filesByFolder.f_beats[0] });
    assert.match(page, /aria-current="page">beats</);
    assert.match(page, /Folder · 2 files · 7\.6 MB/);
    assert.match(page, /Subfolder · 2 files/);
    assert.match(page, /Processing/);
    assert.match(page, /Upload failed, try again/);
    assert.match(page, /role="img" aria-label="Playing"/);
    assert.match(page, /Empty subfolders:/);
    assert.match(page, />drafts</);
    assert.match(page, /\+ Subfolder/);
    assert.match(page, /aria-label="Upload to beats"/);
    assert.match(page, /Rename folder/);
    assert.equal(page.match(/Move folder to Trash/g)?.length, 1, "only the custom subfolder can be trashed");

    assert.match(html({ ...open, whoFilter: "todo" }), /Nothing from todo here\./);
    const inSub = html({ ...open, currentSubFolder: stems, fileLayout: "grid" });
    assert.match(inSub, /class="bs-tracks-grid"/);
    assert.match(inSub, /aria-current="page">stems</);
    assert.match(html({ currentRootFolder: custom }), /deal\.pdf/);
    assert.match(html({ currentRootFolder: folder("f_new") }), /Empty folder\. Tap upload/);

    const did = fired({ ...open, currentSubFolder: stems });
    for (const name of ["onTogglePlay", "onOpenPopover", "onUploadTo", "onRenameFolder", "onTrashFolder", "setWhoFilter", "setFileLayout", "onOpenFolder"]) {
      assert.ok(did.has(name), `${name} is reachable from a folder`);
    }
    assert.ok(fired(open).has("setCreatingFolder"), "+ Subfolder opens the new folder dialog");
  });

  it("search, trash, In Progress and Vision Board still open in the centre pane", () => {
    const found = html({ search: " SNA " });
    assert.match(found, /1 matching file across vault/);
    assert.match(found, /snare\.wav/);
    assert.match(html({ search: "zzz" }), /0 matching files across vault/);

    const entry = { file: filesByFolder.f_beats[0], folderName: "beats", deletedAt: 1 };
    const trash = html({ viewingTrash: true, trashedList: [entry] });
    assert.match(trash, /<h1 class="bs-h1">Trash<\/h1>/);
    assert.match(trash, /title="Restore file"/);
    assert.ok(fired({ viewingTrash: true, trashedList: [entry] }).has("onRestoreFromTrash"));

    assert.match(html({ viewingInProgress: true }), /<h1 class="bs-h1">In Progress<\/h1>/);
    assert.match(html({ viewingVisionBoard: true }), /Collab Vision Board/);
  });

  it("the + menu, the profile menu with the theme switch, and the toast", () => {
    const page = html({ plusMenuOpen: true, profileOpen: true, toast: "Saved" });
    assert.match(page, /Add to Swish Vault/);
    assert.match(page, /Upload track or stem/);
    assert.match(page, /Any file, up to 10 GB/);
    assert.match(page, /aria-pressed="true"[^>]*>Night</);
    assert.match(page, /aria-pressed="false"[^>]*>Paper</);
    assert.match(page, /Sign out/);
    assert.match(page, /<div role="status" class="bs-toast z-\[60\]">Saved<\/div>/);
    assert.match(html({ plusMenuOpen: true, currentRootFolder: beats }), /New subfolder/);

    const did = fired({ plusMenuOpen: true, profileOpen: true });
    for (const name of ["onChangeLook", "onSignOut", "onUploadTo", "setCreatingFolder", "setCreatingSharedVault"]) {
      assert.ok(did.has(name), `${name} is reachable from the menus`);
    }
  });

  it("the new folder dialog picks a line icon and a cover colour", () => {
    const picked: string[] = [];
    const dialog = CreateFolderModal({
      currentRootFolder: null,
      newFolderName: "",
      newFolderDesc: "",
      newFolderIconKey: "vocals",
      newFolderColorIdx: 2,
      onChangeName: () => {},
      onChangeDesc: () => {},
      onChangeIconKey: (k) => picked.push(k),
      onChangeColorIdx: (i) => picked.push(`colour ${i}`),
      onConfirm: () => picked.push("create"),
      onClose: () => {},
    });
    const markup = renderToStaticMarkup(dialog);
    assert.match(markup, /New folder/);
    assert.doesNotMatch(markup, /3D/);
    assert.match(markup, /aria-pressed="true"[^>]*>(<svg.*?<\/svg>)?Mic</s);
    assert.equal(markup.match(/aria-label="Cover colour \d"/g)?.length, 7);
    fireAll(dialog);
    assert.ok(picked.includes("rap_cup") && picked.includes("colour 6") && picked.includes("create"));
  });
});
