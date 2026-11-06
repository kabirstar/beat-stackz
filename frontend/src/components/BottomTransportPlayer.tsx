import type { FileItem, User, VaultMember } from "@bpackz/shared";
import { formatBytes, parseStudioFileDisplay } from "../utils/format.ts";
import { describeFileMeta, resolveFileOwnerName } from "../vaultTheme.ts";
import { CoverTile, folderIconName, StudioIcon } from "./StudioPrimitives.tsx";

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The track as bars. Click a bar to seek there; with the keyboard, left and right move 5 %. */
export function Waveform({
  bars,
  playProgress,
  onSeek,
}: {
  bars: number[];
  playProgress: number;
  onSeek: (pct: number) => void;
}) {
  return (
    <div
      className="bs-wv"
      role="slider"
      tabIndex={0}
      aria-label="Seek on waveform"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={playProgress}
      onKeyDown={(e) => {
        const step = e.key === "ArrowRight" ? 5 : e.key === "ArrowLeft" ? -5 : 0;
        if (step) onSeek(Math.max(0, Math.min(100, playProgress + step)));
      }}
    >
      {bars.map((h, i) => {
        const pct = (i / bars.length) * 100;
        return (
          <span
            key={i}
            data-on={pct <= playProgress ? "" : undefined}
            style={{ height: `${h}%` }}
            onClick={() => onSeek(Math.round(pct))}
          />
        );
      })}
    </div>
  );
}

/** The player bar and, when `fullOpen`, the full-screen song view over the whole app. */
export function BottomTransportPlayer({
  playingFile,
  isPaused = false,
  waveformBars,
  playProgress,
  durationSec,
  loopEnabled,
  cover = null,
  fullOpen = false,
  vaultMembers,
  currentUser,
  onTogglePause,
  onToggleLoop,
  onToggleFull,
  onSeek,
  onShare,
  onDownload,
  onClose,
}: {
  playingFile: FileItem;
  isPaused?: boolean;
  waveformBars: number[];
  playProgress: number;
  durationSec?: number;
  loopEnabled: boolean;
  /** Cover of the file's folder; a plain tile when it is not known. */
  cover?: { color: string; iconKey: string } | null;
  fullOpen?: boolean;
  vaultMembers?: VaultMember[];
  currentUser?: User | null;
  onTogglePause?: () => void;
  onToggleLoop: () => void;
  onToggleFull?: () => void;
  onSeek: (pct: number) => void;
  onShare: (file: FileItem) => void;
  onDownload: (file: FileItem) => void;
  onClose: () => void;
}) {
  const { cleanTitle } = parseStudioFileDisplay(playingFile.name);
  const by = `${resolveFileOwnerName(playingFile.createdBy, vaultMembers, currentUser)} · ${describeFileMeta(playingFile)}`;
  // The <audio> element knows the length once it has loaded; until then use the file's own.
  const length =
    durationSec && Number.isFinite(durationSec) ? durationSec : (playingFile.durationMs ?? 0) / 1000;
  const current = formatClock((playProgress / 100) * length);
  const total = length ? formatClock(length) : "--:--";

  const coverTile = (
    <CoverTile icon={cover ? folderIconName(cover.iconKey) : "songs"} color={cover?.color} />
  );
  const playButton = (
    <button
      type="button"
      className="bs-pb"
      onClick={onTogglePause ?? onClose}
      title={isPaused ? "Play" : "Pause"}
      aria-label={isPaused ? "Play" : "Pause"}
    >
      <StudioIcon name={isPaused ? "play" : "pause"} className="bs-icon" />
    </button>
  );
  const loopButton = (
    <button
      type="button"
      className="bs-ib"
      onClick={onToggleLoop}
      title="Loop"
      aria-label="Loop"
      aria-pressed={loopEnabled}
    >
      <StudioIcon name="loop" className="bs-icon" />
    </button>
  );
  const shareButton = (
    <button
      type="button"
      className="bs-ib bs-opt"
      onClick={() => onShare(playingFile)}
      title="Share"
      aria-label="Share"
    >
      <StudioIcon name="share" className="bs-icon" />
    </button>
  );
  const waveform = <Waveform bars={waveformBars} playProgress={playProgress} onSeek={onSeek} />;

  return (
    <>
      <div className="bs-player">
        <button
          type="button"
          className="bs-pl-info"
          title="Open full-screen view"
          aria-label={`${cleanTitle}, open full-screen view`}
          onClick={onToggleFull}
        >
          {coverTile}
          <span className="bs-tx">
            <b>{cleanTitle}</b>
            <small>{by}</small>
          </span>
        </button>

        <div className="bs-pl-ctr">
          <div className="bs-pl-btns">
            {playButton}
            {loopButton}
          </div>
          {/* Phone seeks on the slider (TOD-102), desktop on the waveform; CSS shows one of them. */}
          <div className="bs-seek">
            <span>{current}</span>
            <input
              type="range"
              aria-label="Seek"
              min={0}
              max={100}
              value={playProgress}
              onChange={(e) => onSeek(Number(e.currentTarget.value))}
              className="flex-1 min-w-0 h-11 cursor-pointer"
            />
            {waveform}
            <span>{total}</span>
          </div>
        </div>

        <div className="bs-pl-acts">
          {shareButton}
          <button
            type="button"
            className="bs-ib bs-opt"
            onClick={() => onDownload(playingFile)}
            title="Download"
            aria-label="Download"
          >
            <StudioIcon name="download" className="bs-icon" />
          </button>
          <button
            type="button"
            className="bs-ib"
            onClick={onClose}
            title="Close player"
            aria-label="Close player"
          >
            <StudioIcon name="close" className="bs-icon" />
          </button>
        </div>
      </div>

      {fullOpen && (
        <div
          className="bs-full"
          role="dialog"
          aria-modal="true"
          aria-label="Now playing"
          onKeyDown={(e) => {
            if (e.key === "Escape") onToggleFull?.();
          }}
        >
          <div className="bs-full-in">
            <div className="bs-full-top">
              <button
                type="button"
                className="bs-ib"
                autoFocus
                onClick={onToggleFull}
                title="Close full-screen view"
                aria-label="Close full-screen view"
              >
                <StudioIcon name="chevron-down" className="bs-icon" />
              </button>
              <span className="bs-label">Now playing</span>
            </div>
            {coverTile}
            <div>
              <h3>{cleanTitle}</h3>
              <span className="bs-sub">{playingFile.name}</span>
            </div>
            <span className="bs-label">
              {by} · {formatBytes(playingFile.size)}
            </span>
            <div>
              {waveform}
              <div className="bs-full-times">
                <span>{current}</span>
                <span>{total}</span>
              </div>
            </div>
            <div className="bs-full-ctl">
              {loopButton}
              {playButton}
              {shareButton}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
