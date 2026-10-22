import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatBytes, parseStudioFileDisplay } from "./App.tsx";
import {
  describeFileMeta,
  generateRandomSharedPalette,
  resolveFileOwnerName,
  resolveFolderUiMeta,
  SWISH_BLACK_RED_PALETTE,
  TODO_MONOCHROME_PALETTE,
} from "./vaultTheme.ts";

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
        createdBy: "u_artist",
        updatedAt: "2026-10-21T00:00:00.000Z",
      },
      {},
      0,
      true,
    );
    assert.equal(sharedBeatsMeta.iconKey, "rap_cup");
  });

  it("formats byte sizes and resolves file owner names", () => {
    assert.equal(formatBytes(48_400_000), "46.2 MB");
    assert.equal(resolveFileOwnerName("u_artist"), "Swish");
    assert.equal(resolveFileOwnerName("u_prod"), "Todo");
    assert.equal(
      describeFileMeta({
        id: "file_1",
        vaultId: "v_personal",
        folderId: "f_root_beats",
        name: "swish_142bpm_dark_loop.wav",
        status: "ready",
        size: 48_400_000,
        mime: "audio/wav",
        sha256: "a".repeat(64),
        durationMs: 148000,
        hasWaveform: true,
        createdBy: "u_artist",
        createdAt: "2026-10-21T00:00:00.000Z",
        updatedAt: "2026-10-21T00:00:00.000Z",
      }),
      "142 BPM · C MIN",
    );
  });
});
