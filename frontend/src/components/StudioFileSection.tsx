import type { FileItem, Folder, User, VaultMember } from "@bpackz/shared";
import { UserAvatarBadge } from "../HardwareIcons.tsx";
import { formatBytes, parseStudioFileDisplay } from "../utils/format.ts";
import {
  describeFileMeta,
  resolveFileOwnerName,
  type HardwareThemeSlot,
  type TrashedFileEntry,
} from "../vaultTheme.ts";
import { StudioIcon } from "./StudioPrimitives.tsx";

export type FileLayoutMode = "cards" | "grid";

const MINI_WAVE = [32, 68, 45, 88, 60, 95, 52, 74, 40, 82, 58, 90, 48, 66, 36, 78];

export function StudioFileCard({
  file,
  idx,
  isPlaying,
  playProgress,
  parentFolderTheme,
  otherUserName,
  vaultMembers,
  currentUser,
  onTogglePlay,
  onDownload,
  onOpenPopover,
  onRetryUpload,
}: {
  file: FileItem;
  idx: number;
  isPlaying: boolean;
  playProgress: number;
  parentFolderTheme: HardwareThemeSlot;
  otherUserName: string;
  vaultMembers?: VaultMember[];
  currentUser?: User | null;
  onTogglePlay: (file: FileItem) => void;
  onDownload: (file: FileItem) => void;
  onOpenPopover: (file: FileItem) => void;
  onRetryUpload?: () => void;
}) {
  const trackNum = String(idx + 1).padStart(2, "0");
  const { cleanTitle, ext, isAudio } = parseStudioFileDisplay(file.name);
  const metaParts = describeFileMeta(file)
    .split("·")
    .map((p) => p.trim())
    .filter(Boolean);
  const ownerName = resolveFileOwnerName(file.createdBy, vaultMembers, currentUser);
  const status = file.status ?? "ready";
  const isProcessing = status === "processing";
  const isFailed = status === "failed";
  const isReady = status === "ready";

  return (
    <article
      className={`file-card ${
        isPlaying && isReady ? "file-card-playing" : ""
      } p-3 sm:px-4 sm:py-3.5 flex items-center justify-between gap-3 sm:gap-4 overflow-hidden`}
    >
      {/* 4px Hardware Color Spine matching Parent 3D Folder */}
      <div
        className="w-1.5 self-stretch rounded-full shrink-0"
        style={{
          background: isFailed
            ? "#ef4444"
            : isProcessing
              ? "#f59e0b"
              : parentFolderTheme.accentPrimary,
        }}
      />

      {/* Left: 44x44px Tactile Hardware Play Tile (or Processing / Failed State) */}
      {isProcessing ? (
        <div
          title="Verifying upload integrity..."
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex flex-col items-center justify-center shrink-0 border border-amber-500/40 bg-amber-500/10 text-amber-800"
        >
          <span className="w-3.5 h-3.5 rounded-full border-2 border-amber-700 border-t-transparent animate-spin" />
          <span className="mono-meta text-[7px] uppercase mt-1 opacity-85">SYNC</span>
        </div>
      ) : isFailed ? (
        <button
          type="button"
          onClick={() => onRetryUpload?.()}
          title="Upload failed — click to try again"
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex flex-col items-center justify-center shrink-0 cursor-pointer transition border border-red-500/40 bg-red-500/10 text-red-700 hover:bg-red-500/20"
        >
          <StudioIcon name="replay" className="w-3.5 h-3.5" />
          <span className="mono-meta text-[7px] uppercase mt-1">RETRY</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onTogglePlay(file)}
          title={isPlaying ? "Pause" : "Play"}
          className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex flex-col items-center justify-center shrink-0 cursor-pointer transition border ${
            isPlaying
              ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] shadow-md"
              : "bg-[var(--card)] text-[var(--ink)] border-[var(--ink)]/15 hover:bg-[var(--ink)] hover:text-[var(--bg)]"
          }`}
        >
          {isPlaying ? (
            <>
              <span className="flex items-end gap-0.5 h-3.5">
                <span className="w-0.5 bg-current eq-bar-1" />
                <span className="w-0.5 bg-current eq-bar-2" />
                <span className="w-0.5 bg-current eq-bar-3" />
              </span>
              <span className="mono-meta text-[8px] uppercase mt-0.5 opacity-80">ON</span>
            </>
          ) : (
            <>
              <StudioIcon name="play" className="w-3.5 h-3.5 ml-0.5" />
              <span className="mono-meta text-[9px] opacity-65 mt-0.5">{trackNum}</span>
            </>
          )}
        </button>
      )}

      {/* Center: Studio Mono Title + Format Pill + Separated Spec Badges */}
      <div
        onClick={() => {
          if (isReady) onTogglePlay(file);
          else if (isFailed) onRetryUpload?.();
        }}
        className={`min-w-0 flex-1 ${isReady || isFailed ? "cursor-pointer" : "cursor-default"}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="file-title-font text-[15px] sm:text-[17px] text-[var(--ink)] truncate">
            {cleanTitle}
          </h3>
          <span
            className="mono-meta text-[9px] uppercase px-1.5 py-0.5 rounded-md border shrink-0 font-semibold"
            style={{
              background: `${parentFolderTheme.accentPrimary}18`,
              color: "var(--ink)",
              borderColor: `${parentFolderTheme.accentPrimary}55`,
            }}
          >
            {ext}
          </span>
          {isProcessing && (
            <span className="mono-meta text-[9px] uppercase px-2 py-0.5 rounded-md border shrink-0 font-semibold bg-amber-500/15 text-amber-800 border-amber-500/40 inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
              Verifying
            </span>
          )}
          {isFailed && (
            <span className="mono-meta text-[9px] uppercase px-2 py-0.5 rounded-md border shrink-0 font-semibold bg-red-500/15 text-red-700 border-red-500/40">
              Upload failed, try again
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <span className="mono-meta text-[10px] text-[var(--ink-soft)] bg-black/[0.04] px-2 py-0.5 rounded-md truncate max-w-[180px] sm:max-w-[240px]">
            {file.name}
          </span>
          {metaParts.map((mp) => (
            <span
              key={mp}
              className="mono-meta text-[9px] uppercase px-1.5 py-0.5 rounded-md bg-[var(--card)] border border-[var(--hair)] text-[var(--ink)]"
            >
              {mp}
            </span>
          ))}
          <span className="mono-meta text-[9px] uppercase px-1.5 py-0.5 rounded-md bg-[var(--card-deep)] text-[var(--ink)] font-semibold">
            {formatBytes(file.size)}
          </span>
        </div>
      </div>

      {/* Center-Right: Interactive Mini Waveform Strip for Ready Audio Files */}
      {isAudio && isReady && (
        <div
          onClick={() => onTogglePlay(file)}
          className="hidden md:flex items-center gap-0.5 h-8 px-2.5 py-1 rounded-xl bg-[var(--card)]/70 border border-[var(--hair)] cursor-pointer shrink-0"
          title="Tap to preview waveform"
        >
          {MINI_WAVE.map((h, wIdx) => {
            const barActive =
              isPlaying && (wIdx / MINI_WAVE.length) * 100 <= playProgress;
            return (
              <span
                key={wIdx}
                className="w-1 rounded-full transition-all"
                style={{
                  height: `${Math.max(4, Math.round(h * 0.22))}px`,
                  background: barActive
                    ? parentFolderTheme.accentPrimary
                    : "rgba(22,19,43,0.28)",
                }}
              />
            );
          })}
        </div>
      )}

      {/* Right: Mobile-Ergonomic Action Zone */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[var(--card)] border border-[var(--hair)]"
          title={`Uploaded by ${ownerName}`}
        >
          <UserAvatarBadge byName={ownerName} sizeClass="w-4 h-4 text-[8px]" />
          <span className="mono-meta text-[9px] uppercase text-[var(--ink)] hidden sm:inline">
            {ownerName}
          </span>
        </div>

        {isFailed && onRetryUpload && (
          <button
            type="button"
            onClick={onRetryUpload}
            className="px-2.5 py-1.5 rounded-xl bg-red-600 text-white mono-meta text-[9px] uppercase cursor-pointer hover:bg-red-700 transition"
          >
            Try again
          </button>
        )}

        {isReady && (
          <button
            type="button"
            onClick={() => onDownload(file)}
            title="Download master file"
            className="icon-btn w-9 h-9 hidden sm:inline-flex"
          >
            <StudioIcon name="download" className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={() => onOpenPopover(file)}
          title={`Share to ${otherUserName}, Shared Vault, or Copy Link`}
          className="icon-btn w-10 h-10 sm:w-9 sm:h-9"
        >
          <StudioIcon name="share" className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onOpenPopover(file)}
          title="More options"
          className="icon-btn w-10 h-10 sm:w-9 sm:h-9"
        >
          <StudioIcon name="more" />
        </button>
      </div>
    </article>
  );
}

export function StudioFileSection({
  currentRootFolder,
  currentSubFolder,
  currentSubfolders,
  forceFilesView,
  filesByFolder,
  activeFolderFiles,
  filteredFolderFiles,
  trackFilter,
  fileLayout,
  playingFileId,
  playProgress,
  parentFolderTheme,
  otherUserName,
  vaultMembers,
  currentUser,
  onSelectAllInRoot,
  onSelectSubfolder,
  onOpenCreateSubfolder,
  onChangeTrackFilter,
  onChangeFileLayout,
  onUploadClick,
  onTogglePlay,
  onDownload,
  onOpenPopover,
}: {
  currentRootFolder: Folder | null;
  currentSubFolder: Folder | null;
  currentSubfolders: Folder[];
  forceFilesView: boolean;
  filesByFolder: Record<string, FileItem[]>;
  activeFolderFiles: FileItem[];
  filteredFolderFiles: FileItem[];
  trackFilter: "all" | "swish" | "todo";
  fileLayout: FileLayoutMode;
  playingFileId: string | null;
  playProgress: number;
  parentFolderTheme: HardwareThemeSlot;
  otherUserName: string;
  vaultMembers?: VaultMember[];
  currentUser?: User | null;
  onSelectAllInRoot: () => void;
  onSelectSubfolder: (subId: string) => void;
  onOpenCreateSubfolder: () => void;
  onChangeTrackFilter: (chip: "all" | "swish" | "todo") => void;
  onChangeFileLayout: (layout: FileLayoutMode) => void;
  onUploadClick: () => void;
  onTogglePlay: (file: FileItem) => void;
  onDownload: (file: FileItem) => void;
  onOpenPopover: (file: FileItem) => void;
}) {
  return (
    <section className="py-5 sm:py-7 space-y-4">
      {/* 1. Mobile-First Subfolder Pill Switcher */}
      {currentRootFolder && currentSubfolders.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="mono-meta text-[10px] uppercase text-[var(--ink-soft)] shrink-0 mr-1">
            Folder:
          </span>
          <button
            type="button"
            onClick={onSelectAllInRoot}
            className={`px-3.5 py-2 rounded-2xl mono-meta text-[11px] uppercase flex items-center gap-2 shrink-0 cursor-pointer border transition ${
              !currentSubFolder && forceFilesView
                ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] shadow-sm"
                : "bg-[#f4f1eb] text-[var(--ink)] border-[var(--hair)] hover:border-[var(--ink)]"
            }`}
          >
            <span>All {currentRootFolder.name}</span>
            <span className="opacity-65">
              ({(filesByFolder[currentRootFolder.id] ?? []).length})
            </span>
          </button>
          {currentSubfolders.map((sf) => {
            const activeSub = currentSubFolder?.id === sf.id;
            const sfCount = (filesByFolder[sf.id] ?? []).length;
            return (
              <button
                key={sf.id}
                type="button"
                onClick={() => onSelectSubfolder(sf.id)}
                className={`px-3.5 py-2 rounded-2xl mono-meta text-[11px] uppercase flex items-center gap-2 shrink-0 cursor-pointer border transition ${
                  activeSub
                    ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] shadow-sm"
                    : "bg-[#f4f1eb] text-[var(--ink)] border-[var(--hair)] hover:border-[var(--ink)]"
                }`}
              >
                <span>{sf.name}</span>
                <span className="opacity-65">({sfCount})</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={onOpenCreateSubfolder}
            className="px-3 py-2 rounded-2xl mono-meta text-[11px] uppercase bg-[var(--card)] text-[var(--ink-soft)] hover:text-[var(--ink)] border border-dashed border-[var(--ink)]/30 shrink-0 cursor-pointer"
          >
            + Subfolder
          </button>
        </div>
      )}

      {/* 2. Collaborator Filter Chips + Layout Toggle + Upload Button */}
      <div className="p-3 sm:px-4 sm:py-3 rounded-2xl bg-[var(--card)] border border-[var(--hair)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "all", label: `All (${activeFolderFiles.length})` },
              { id: "swish", label: "Swish" },
              { id: "todo", label: "Todo" },
            ] as const
          ).map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => onChangeTrackFilter(chip.id)}
              className={`px-3 py-1.5 rounded-xl mono-meta text-[10px] uppercase cursor-pointer transition ${
                trackFilter === chip.id
                  ? "bg-[var(--ink)] text-[var(--bg)] font-semibold shadow-xs"
                  : "bg-[#f4f1eb] text-[var(--ink-soft)] hover:text-[var(--ink)] border border-[var(--hair)]"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-[#f4f1eb] p-0.5 border border-[var(--hair)]">
            {(["cards", "grid"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onChangeFileLayout(mode)}
                className={`px-2.5 py-1 rounded-lg mono-meta text-[10px] uppercase cursor-pointer transition ${
                  fileLayout === mode
                    ? "bg-[var(--ink)] text-[var(--bg)]"
                    : "text-[var(--ink-soft)]"
                }`}
              >
                {mode === "cards" ? "Cards" : "Grid"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onUploadClick}
            title="Upload Track / Stem"
            className="px-3.5 py-2 rounded-xl bg-[var(--ink)] text-[var(--bg)] mono-meta text-[10px] uppercase flex items-center gap-1.5 cursor-pointer hover:opacity-90 transition shadow-sm"
          >
            <StudioIcon name="upload" className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Upload</span>
          </button>
        </div>
      </div>

      {/* 3. Separated File Cards */}
      {filteredFolderFiles.length === 0 ? (
        <div className="file-card px-6 py-12 text-center mono-meta text-[11px] uppercase text-[var(--ink-soft)]">
          Empty folder — tap Upload above to drop stems or masters.
        </div>
      ) : (
        <div
          className={
            fileLayout === "grid"
              ? "grid grid-cols-1 lg:grid-cols-2 gap-3.5"
              : "flex flex-col gap-3"
          }
        >
          {filteredFolderFiles.map((f, idx) => (
            <StudioFileCard
              key={f.id}
              file={f}
              idx={idx}
              isPlaying={playingFileId === f.id}
              playProgress={playProgress}
              parentFolderTheme={parentFolderTheme}
              otherUserName={otherUserName}
              vaultMembers={vaultMembers}
              currentUser={currentUser}
              onTogglePlay={onTogglePlay}
              onDownload={onDownload}
              onOpenPopover={onOpenPopover}
              onRetryUpload={onUploadClick}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function TrashSection({
  trashedList,
  onRestore,
}: {
  trashedList: TrashedFileEntry[];
  onRestore: (entry: TrashedFileEntry) => void;
}) {
  return (
    <section className="py-6 sm:py-8">
      <div className="rounded-2xl bg-[var(--card)] border border-[var(--hair)] overflow-hidden">
        <div className="px-4 sm:px-6 py-3 border-b border-[var(--hair)] bg-[var(--card-deep)] flex items-center justify-between">
          <span className="mono-meta text-[10px] uppercase text-[var(--ink-soft)]">
            {trashedList.length} {trashedList.length === 1 ? "ITEM" : "ITEMS"}
          </span>
        </div>
        {trashedList.length === 0 ? (
          <div className="px-6 py-12 text-center mono-meta text-[11px] uppercase text-[var(--ink-soft)]">
            TRASH IS EMPTY.
          </div>
        ) : (
          <div className="divide-y divide-[var(--hair)]">
            {trashedList.map((entry) => (
              <div
                key={entry.file.id}
                className="px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4"
              >
                <div>
                  <div className="file-title-font text-sm text-[var(--ink)]">
                    {entry.file.name}
                  </div>
                  <div className="mono-meta text-[10px] uppercase text-[var(--ink-soft)]">
                    {entry.folderName} · {formatBytes(entry.file.size)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRestore(entry)}
                  title="Restore file"
                  className="icon-btn icon-btn-active w-8 h-8"
                >
                  <StudioIcon name="restore" className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
