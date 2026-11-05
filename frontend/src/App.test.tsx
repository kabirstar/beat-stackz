import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReactElement, ReactNode } from "react";
import { BottomTransportPlayer } from "./components/BottomTransportPlayer.tsx";
import { formatBytes, parseStudioFileDisplay } from "./App.tsx";
import { computeBlobSha256, createSampleWavBlob } from "./utils/format.ts";
import {
  describeFileMeta,
  generateRandomSharedPalette,
  resolveFileOwnerName,
  resolveFolderUiMeta,
  sortVaultFolders,
  SWISH_BLACK_RED_PALETTE,
  TODO_MONOCHROME_PALETTE,
} from "./vaultTheme.ts";
import {
  isVaultPasscodeValid,
  maskWithAsterisks,
} from "./components/VaultGateScreen.tsx";
import {
  classifyFlStudioStem,
  IN_PROGRESS_BUCKETS,
  inferSongTitleFromBatch,
} from "./utils/inProgressAutoRouter.ts";

describe("The Vault UI & Theme Specification (T020 & T021)", () => {
  it("locks Swish theme to Mostly Black & Red and Todo theme to White & Black Monochrome", () => {
    assert.equal(SWISH_BLACK_RED_PALETTE.length, 5);
    assert.equal(SWISH_BLACK_RED_PALETTE[0].chassisBg, "#0b0a0c");
    assert.equal(SWISH_BLACK_RED_PALETTE[0].accentPrimary, "#dc2626");

    assert.equal(TODO_MONOCHROME_PALETTE.length, 5);
    assert.equal(TODO_MONOCHROME_PALETTE[0].accentPrimary, "#fafafa");
    assert.equal(TODO_MONOCHROME_PALETTE[1].accentPrimary, "#111114");
  });

  it("generates a 5-slot random hardware palette for Shared Vaults", () => {
    const sharedPalette = generateRandomSharedPalette();
    assert.equal(sharedPalette.length, 5);
    assert.ok(sharedPalette[0].accentPrimary.startsWith("hsl("));
  });

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
      0,
      true,
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
      0,
      true,
    );
    assert.equal(sharedBeatsMeta.iconKey, "rap_cup");

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
