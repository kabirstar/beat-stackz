import type { FileItem } from "@bpackz/shared";
import { UserAvatarBadge } from "../HardwareIcons.tsx";
import { formatBytes } from "../utils/format.ts";
import { describeFileMeta, resolveFileOwnerName } from "../vaultTheme.ts";
import { StudioIcon } from "./StudioPrimitives.tsx";

export function BottomTransportPlayer({
  playingFile,
  waveformBars,
  playProgress,
  loopEnabled,
  onToggleLoop,
  onSeek,
  onShare,
  onDownload,
  onClose,
}: {
  playingFile: FileItem;
  waveformBars: number[];
  playProgress: number;
  loopEnabled: boolean;
  onToggleLoop: () => void;
  onSeek: (pct: number) => void;
  onShare: (file: FileItem) => void;
  onDownload: (file: FileItem) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 px-4 sm:px-8 py-2.5 bg-[#e4e0d8]/95 backdrop-blur-xl border-t border-[var(--hair)] flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1 max-w-xs">
        <UserAvatarBadge
          byName={resolveFileOwnerName(playingFile.createdBy)}
          sizeClass="w-8 h-8 text-xs"
        />
        <div className="min-w-0">
          <div className="file-title-font text-xs text-[var(--ink)] truncate">
            {playingFile.name}
          </div>
          <div className="mono-meta text-[10px] uppercase text-[var(--ink-soft)] truncate">
            {describeFileMeta(playingFile)} · {formatBytes(playingFile.size)}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 flex-1 max-w-md">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleLoop}
            title="Loop"
            className={`icon-btn w-7 h-7 ${loopEnabled ? "icon-btn-active" : ""}`}
          >
            <StudioIcon name="loop" className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onClose}
            title="Pause"
            className="icon-btn icon-btn-active w-9 h-9"
          >
            <StudioIcon name="pause" />
          </button>
        </div>

        <div className="w-full hidden sm:flex items-center gap-1">
          {waveformBars.map((h, i) => {
            const active = (i / waveformBars.length) * 100 <= playProgress;
            return (
              <div
                key={i}
                onClick={() => onSeek(Math.round(((i + 1) / waveformBars.length) * 100))}
                className="flex-1 rounded-xs cursor-pointer transition"
                style={{
                  height: `${Math.max(5, Math.round(h * 0.22))}px`,
                  background: active ? "var(--ink)" : "rgba(22,19,43,0.2)",
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 flex-1 max-w-xs">
        <button
          type="button"
          onClick={() => onShare(playingFile)}
          title="Share"
          className="icon-btn w-8 h-8"
        >
          <StudioIcon name="share" className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDownload(playingFile)}
          title="Download"
          className="icon-btn w-8 h-8"
        >
          <StudioIcon name="download" className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Close player"
          className="icon-btn w-8 h-8"
        >
          ×
        </button>
      </div>
    </div>
  );
}
