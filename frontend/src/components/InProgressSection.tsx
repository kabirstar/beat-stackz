import { useRef, useState } from "react";
import type { FileItem, Folder, User, VaultMember } from "@bpackz/shared";
import {
  IN_PROGRESS_BUCKETS,
  readDroppedSessionDataTransfer,
  type InProgressBucketKey,
} from "../utils/inProgressAutoRouter.ts";
import type { HardwareThemeSlot } from "../vaultTheme.ts";
import { StudioFileCard, type FileLayoutMode } from "./StudioFileSection.tsx";
import { StudioIcon } from "./StudioPrimitives.tsx";

export interface InProgressSongEcosystem {
  songFolder: Folder;
  bucketFolders: Partial<Record<InProgressBucketKey, Folder>>;
  filesByBucket: Record<InProgressBucketKey, FileItem[]>;
  unbucketedFiles: FileItem[];
  totalFiles: number;
}

export interface LastAutoRouteSummary {
  songName: string;
  songFolderId: string;
  counts: Record<InProgressBucketKey, number>;
  totalRouted: number;
}

export function InProgressSection({
  songs,
  activeSongId,
  activeBucketFilter,
  isImporting,
  importStatusText,
  lastRouteSummary,
  fileLayout,
  playingFileId,
  playProgress,
  parentFolderTheme,
  otherUserName,
  vaultMembers,
  currentUser,
  onSelectSong,
  onSelectBucketFilter,
  onImportSessionFiles,
  onCreateEmptySong,
  onSpawnDemoFlSession,
  onUploadToSongBucket,
  onMoveFileToBucket,
  onRenameSong,
  onTrashSong,
  onChangeFileLayout,
  onTogglePlay,
  onDownload,
  onOpenPopover,
}: {
  songs: InProgressSongEcosystem[];
  activeSongId: string | null;
  activeBucketFilter: "all" | InProgressBucketKey;
  isImporting: boolean;
  importStatusText: string | null;
  lastRouteSummary: LastAutoRouteSummary | null;
  fileLayout: FileLayoutMode;
  playingFileId: string | null;
  playProgress: number;
  parentFolderTheme: HardwareThemeSlot;
  otherUserName: string;
  vaultMembers?: VaultMember[];
  currentUser?: User | null;
  onSelectSong: (songFolderId: string | null) => void;
  onSelectBucketFilter: (bucket: "all" | InProgressBucketKey) => void;
  onImportSessionFiles: (
    files: File[],
    explicitSongTitle?: string,
    detectedContainerName?: string | null,
  ) => void;
  onCreateEmptySong: (songTitle: string) => void;
  onSpawnDemoFlSession: (songTitle?: string) => void;
  onUploadToSongBucket: (
    songFolderId: string,
    bucket: InProgressBucketKey | "auto",
    files: File[],
  ) => void;
  onMoveFileToBucket: (
    file: FileItem,
    songFolderId: string,
    targetBucket: InProgressBucketKey,
  ) => void;
  onRenameSong: (songFolder: Folder) => void;
  onTrashSong: (songFolder: Folder) => void;
  onChangeFileLayout: (mode: FileLayoutMode) => void;
  onTogglePlay: (file: FileItem) => void;
  onDownload: (file: FileItem) => void;
  onOpenPopover: (file: FileItem) => void;
}) {
  const [songTitleInput, setSongTitleInput] = useState("");
  const [isDragOverTop, setIsDragOverTop] = useState(false);
  const [isDragOverSong, setIsDragOverSong] = useState(false);

  const folderPickerRef = useRef<HTMLInputElement | null>(null);
  const filesPickerRef = useRef<HTMLInputElement | null>(null);
  const songBucketPickerRef = useRef<HTMLInputElement | null>(null);
  const [pendingSongBucketTarget, setPendingSongBucketTarget] = useState<{
    songFolderId: string;
    bucket: InProgressBucketKey | "auto";
  } | null>(null);

  const activeSong =
    songs.find((s) => s.songFolder.id === activeSongId) ?? songs[0] ?? null;

  const handleTopDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverTop(false);
    if (isImporting) return;

    const { files, detectedContainerName } = await readDroppedSessionDataTransfer(
      e.dataTransfer,
    );
    if (files.length === 0) return;

    const customTitle = songTitleInput.trim() || undefined;
    onImportSessionFiles(files, customTitle, detectedContainerName);
    setSongTitleInput("");
  };

  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const arr = Array.from(fileList);
    const firstRelPath = (arr[0] as File & { webkitRelativePath?: string }).webkitRelativePath;
    const folderName = firstRelPath ? firstRelPath.split("/")[0] || null : null;
    const customTitle = songTitleInput.trim() || undefined;
    onImportSessionFiles(arr, customTitle, folderName);
    setSongTitleInput("");
    e.target.value = "";
  };

  const handleFilesInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const arr = Array.from(fileList);
    const customTitle = songTitleInput.trim() || undefined;
    onImportSessionFiles(arr, customTitle, null);
    setSongTitleInput("");
    e.target.value = "";
  };

  const handleSongBucketInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !pendingSongBucketTarget) return;
    onUploadToSongBucket(
      pendingSongBucketTarget.songFolderId,
      pendingSongBucketTarget.bucket,
      Array.from(fileList),
    );
    setPendingSongBucketTarget(null);
    e.target.value = "";
  };

  const triggerSongBucketUpload = (
    songFolderId: string,
    bucket: InProgressBucketKey | "auto",
  ) => {
    setPendingSongBucketTarget({ songFolderId, bucket });
    songBucketPickerRef.current?.click();
  };

  return (
    <section className="py-5 sm:py-7 space-y-6">
      {/* Hidden File & Directory Pickers */}
      <input
        ref={folderPickerRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is standard in modern desktop browsers for directory selection
        webkitdirectory=""
        directory=""
        className="hidden"
        onChange={handleFolderInputChange}
      />
      <input
        ref={filesPickerRef}
        type="file"
        multiple
        accept=".wav,.mp3,.flac,.aiff,.aif,.m4a,.ogg,.zip,.flp,audio/*"
        className="hidden"
        onChange={handleFilesInputChange}
      />
      <input
        ref={songBucketPickerRef}
        type="file"
        multiple
        accept=".wav,.mp3,.flac,.aiff,.aif,.m4a,.ogg,.zip,.flp,audio/*"
        className="hidden"
        onChange={handleSongBucketInputChange}
      />

      {/* 1. FL Studio Session Auto-Router Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isDragOverTop) setIsDragOverTop(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOverTop(false);
        }}
        onDrop={(e) => void handleTopDrop(e)}
        className={`rounded-3xl p-4 sm:p-6 border-2 border-dashed transition-all relative overflow-hidden ${
          isDragOverTop
            ? "bg-white border-[var(--ink)] shadow-xl scale-[1.005]"
            : "bg-[var(--card)] border-[var(--ink)]/25 hover:border-[var(--ink)]/50"
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: parentFolderTheme.accentPrimary }}
              />
              <span className="mono-meta text-[10px] uppercase tracking-wider font-semibold text-[var(--ink)]">
                FL Studio Split Mixer Tracks · Auto-Stem Ecosystem
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-[var(--ink)]">
              Drop an exported FL Studio folder, <code className="text-sm">.zip</code> loop package, or stem batch
            </h2>
            <p className="text-xs sm:text-sm text-[var(--ink-soft)] leading-relaxed">
              Automatically creates a dedicated folder for the song with{" "}
              <span className="font-semibold text-[var(--ink)]">
                beat · main · bg · adlib · demo · mixed
              </span>{" "}
              subfolders and routes every file into its matching section for the producer.
            </p>
          </div>

          {/* Subfolder Preview Pills */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {IN_PROGRESS_BUCKETS.map((b) => (
              <span
                key={b.key}
                className="mono-meta text-[9px] uppercase px-2.5 py-1 rounded-full border font-semibold"
                style={{
                  background: `${b.badgeColor}14`,
                  color: b.badgeColor,
                  borderColor: `${b.badgeColor}40`,
                }}
              >
                /{b.key}
              </span>
            ))}
          </div>
        </div>

        {/* Song Name Input + Upload Trigger Buttons */}
        <div className="mt-4 pt-4 border-t border-[var(--hair)] flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={songTitleInput}
              onChange={(e) => setSongTitleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && songTitleInput.trim()) {
                  onCreateEmptySong(songTitleInput.trim());
                  setSongTitleInput("");
                }
              }}
              placeholder="Song name (optional — auto-detected from FL folder, .zip, or stem names)..."
              disabled={isImporting}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[#f4f1eb] border border-[var(--hair)] focus:border-[var(--ink)] focus:outline-none text-xs sm:text-sm text-[var(--ink)] placeholder:text-[var(--ink-soft)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isImporting}
              onClick={() => folderPickerRef.current?.click()}
              className="px-3.5 py-2.5 rounded-2xl bg-[var(--ink)] text-[var(--bg)] mono-meta text-[10px] uppercase font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:opacity-90 transition disabled:opacity-50 shadow-sm"
            >
              <StudioIcon name="upload" className="w-3.5 h-3.5" />
              <span>Upload FL Folder</span>
            </button>

            <button
              type="button"
              disabled={isImporting}
              onClick={() => filesPickerRef.current?.click()}
              className="px-3.5 py-2.5 rounded-2xl bg-[#f4f1eb] text-[var(--ink)] border border-[var(--ink)]/25 hover:border-[var(--ink)] mono-meta text-[10px] uppercase font-semibold inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
            >
              <StudioIcon name="plus" className="w-3.5 h-3.5" />
              <span>Stems / .ZIP / .FLP</span>
            </button>

            <button
              type="button"
              disabled={isImporting}
              onClick={() => {
                const name =
                  songTitleInput.trim() ||
                  (typeof window !== "undefined" && typeof window.prompt === "function"
                    ? window.prompt("New Song Title:", "Untitled Session")
                    : "Untitled Session");
                if (!name || !name.trim()) return;
                onCreateEmptySong(name.trim());
                setSongTitleInput("");
              }}
              className="px-3 py-2.5 rounded-2xl bg-[var(--card-deep)] text-[var(--ink)] border border-[var(--hair)] hover:border-[var(--ink)] mono-meta text-[10px] uppercase cursor-pointer transition disabled:opacity-50"
            >
              + Empty Song
            </button>

            <button
              type="button"
              disabled={isImporting}
              onClick={() => {
                onSpawnDemoFlSession(songTitleInput.trim() || undefined);
                setSongTitleInput("");
              }}
              title="Simulate dropping an FL Studio split-mixer folder with Beat, Main, BG, Adlib, Demo, and Mixed tracks"
              className="px-3 py-2.5 rounded-2xl bg-amber-500/15 text-amber-900 border border-amber-600/35 hover:bg-amber-500/25 mono-meta text-[10px] uppercase font-semibold cursor-pointer transition disabled:opacity-50"
            >
              ⚡ Test FL Auto-Sort
            </button>
          </div>
        </div>

        {/* Active Import Progress Bar */}
        {isImporting && (
          <div className="mt-3 px-3.5 py-2.5 rounded-2xl bg-[var(--ink)] text-[var(--bg)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin shrink-0" />
              <span className="mono-meta text-[10px] uppercase">
                {importStatusText || "Creating song folder & routing stems..."}
              </span>
            </div>
          </div>
        )}

        {/* Last Auto-Route Breakdown Receipt */}
        {!isImporting && lastRouteSummary && (
          <div className="mt-3 px-3.5 py-2.5 rounded-2xl bg-emerald-500/12 border border-emerald-600/30 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <StudioIcon name="check" className="w-4 h-4 text-emerald-800" />
              <span className="mono-meta text-[10px] uppercase text-emerald-950 font-semibold">
                Auto-routed {lastRouteSummary.totalRouted}{" "}
                {lastRouteSummary.totalRouted === 1 ? "file" : "files"} into &ldquo;
                {lastRouteSummary.songName}&rdquo;
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {IN_PROGRESS_BUCKETS.map((b) => {
                const count = lastRouteSummary.counts[b.key] ?? 0;
                if (count === 0) return null;
                return (
                  <span
                    key={b.key}
                    className="mono-meta text-[9px] uppercase px-2 py-0.5 rounded-md bg-white/80 border border-emerald-700/25 text-emerald-950 font-semibold"
                  >
                    {b.shortLabel}: {count}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 2. Song Ecosystems Selector Strip */}
      {songs.length === 0 ? (
        <div className="file-card px-6 py-14 text-center space-y-2">
          <div className="mono-meta text-[11px] uppercase text-[var(--ink-soft)]">
            No songs in progress yet
          </div>
          <p className="text-xs text-[var(--ink-soft)] max-w-md mx-auto">
            Drop an exported FL Studio folder above or tap{" "}
            <strong className="text-[var(--ink)]">⚡ Test FL Auto-Sort</strong> to spin up your
            first self-contained song ecosystem.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="mono-meta text-[10px] uppercase text-[var(--ink-soft)]">
                Songs In Progress ({songs.length}) — Each song keeps its own Beat, Main, BG, Adlib,
                Demo &amp; Mixed ecosystem
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {songs.map((song) => {
                const isSelected = activeSong?.songFolder.id === song.songFolder.id;
                const hasMixed = (song.filesByBucket.mixed?.length ?? 0) > 0;
                const hasDemo = (song.filesByBucket.demo?.length ?? 0) > 0;
                return (
                  <div
                    key={song.songFolder.id}
                    onClick={() => onSelectSong(song.songFolder.id)}
                    className={`p-3.5 rounded-2xl border transition cursor-pointer flex flex-col justify-between gap-3 ${
                      isSelected
                        ? "bg-white border-[var(--ink)] shadow-md ring-1 ring-[var(--ink)]"
                        : "bg-[var(--card)] border-[var(--hair)] hover:border-[var(--ink)]/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{
                              background: hasMixed
                                ? "#0891b2"
                                : hasDemo
                                  ? "#059669"
                                  : parentFolderTheme.accentPrimary,
                            }}
                          />
                          <h3 className="file-title-font text-base font-semibold text-[var(--ink)] truncate">
                            {song.songFolder.name}
                          </h3>
                        </div>
                        <div className="mono-meta text-[9px] uppercase text-[var(--ink-soft)] mt-0.5 pl-4">
                          {song.totalFiles} {song.totalFiles === 1 ? "file" : "files"} ·{" "}
                          {hasMixed ? "Mix Ready" : "Awaiting Producer Mix"}
                        </div>
                      </div>

                      <span
                        className={`mono-meta text-[8px] uppercase px-2 py-0.5 rounded-full shrink-0 font-semibold ${
                          isSelected
                            ? "bg-[var(--ink)] text-[var(--bg)]"
                            : "bg-[var(--card-deep)] text-[var(--ink-soft)]"
                        }`}
                      >
                        {isSelected ? "Open" : "View"}
                      </span>
                    </div>

                    {/* 6 Subfolder Mini Counters */}
                    <div className="grid grid-cols-6 gap-1 pt-2 border-t border-[var(--hair)]">
                      {IN_PROGRESS_BUCKETS.map((b) => {
                        const count = song.filesByBucket[b.key]?.length ?? 0;
                        return (
                          <div
                            key={b.key}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectSong(song.songFolder.id);
                              onSelectBucketFilter(b.key);
                            }}
                            title={`${b.label}: ${count} file(s)`}
                            className={`rounded-lg py-1 px-1 text-center border transition ${
                              count > 0
                                ? "bg-[#f4f1eb] border-[var(--ink)]/20 text-[var(--ink)]"
                                : "bg-black/[0.02] border-transparent text-[var(--ink-soft)] opacity-55"
                            }`}
                          >
                            <div
                              className="mono-meta text-[7.5px] uppercase font-bold truncate"
                              style={count > 0 ? { color: b.badgeColor } : undefined}
                            >
                              {b.shortLabel}
                            </div>
                            <div className="mono-meta text-[10px] font-semibold">{count}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Active Song Self-Contained Ecosystem Workspace */}
          {activeSong && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!isDragOverSong) setIsDragOverSong(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragOverSong(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragOverSong(false);
                void readDroppedSessionDataTransfer(e.dataTransfer).then(({ files }) => {
                  if (files.length > 0) {
                    onUploadToSongBucket(
                      activeSong.songFolder.id,
                      activeBucketFilter === "all" ? "auto" : activeBucketFilter,
                      files,
                    );
                  }
                });
              }}
              className={`rounded-3xl p-4 sm:p-6 bg-[var(--card)] border transition space-y-5 ${
                isDragOverSong
                  ? "border-[var(--ink)] ring-2 ring-[var(--ink)] bg-white"
                  : "border-[var(--hair)]"
              }`}
            >
              {/* Song Ecosystem Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--hair)]">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="mono-meta text-[9px] uppercase px-2 py-0.5 rounded-md bg-[var(--ink)] text-[var(--bg)] font-semibold">
                      SONG ECOSYSTEM
                    </span>
                    <h3 className="display-heading text-xl sm:text-3xl text-[var(--ink)]">
                      {activeSong.songFolder.name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => onRenameSong(activeSong.songFolder)}
                      className="px-2 py-1 rounded-full bg-[#f4f1eb] border border-[var(--hair)] hover:border-[var(--ink)] mono-meta text-[9px] uppercase text-[var(--ink-soft)] hover:text-[var(--ink)] cursor-pointer"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => onTrashSong(activeSong.songFolder)}
                      className="px-2 py-1 rounded-full bg-[#f4f1eb] border border-[var(--hair)] hover:border-red-600 mono-meta text-[9px] uppercase text-red-700 cursor-pointer"
                    >
                      Trash Song
                    </button>
                  </div>
                  <p className="mono-meta text-[10px] uppercase text-[var(--ink-soft)] mt-1">
                    in progress / {activeSong.songFolder.name} · {activeSong.totalFiles} total{" "}
                    {activeSong.totalFiles === 1 ? "file" : "files"} across 6 subfolders
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
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
                    onClick={() =>
                      triggerSongBucketUpload(
                        activeSong.songFolder.id,
                        activeBucketFilter === "all" ? "auto" : activeBucketFilter,
                      )
                    }
                    className="px-3.5 py-2 rounded-xl bg-[var(--ink)] text-[var(--bg)] mono-meta text-[10px] uppercase font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:opacity-90 transition shadow-sm"
                  >
                    <StudioIcon name="upload" className="w-3.5 h-3.5" />
                    <span>
                      {activeBucketFilter === "all"
                        ? "Auto-Sort Stems into Song"
                        : `Upload to /${activeBucketFilter}`}
                    </span>
                  </button>
                </div>
              </div>

              {/* 6 Subfolder Filter Pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => onSelectBucketFilter("all")}
                  className={`px-3.5 py-2 rounded-2xl mono-meta text-[10px] uppercase flex items-center gap-1.5 shrink-0 cursor-pointer border transition ${
                    activeBucketFilter === "all"
                      ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-semibold shadow-xs"
                      : "bg-[#f4f1eb] text-[var(--ink)] border-[var(--hair)] hover:border-[var(--ink)]"
                  }`}
                >
                  <span>All Subfolders</span>
                  <span className="opacity-70">({activeSong.totalFiles})</span>
                </button>

                {IN_PROGRESS_BUCKETS.map((b) => {
                  const count = activeSong.filesByBucket[b.key]?.length ?? 0;
                  const isActive = activeBucketFilter === b.key;
                  return (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => onSelectBucketFilter(b.key)}
                      className={`px-3.5 py-2 rounded-2xl mono-meta text-[10px] uppercase flex items-center gap-1.5 shrink-0 cursor-pointer border transition ${
                        isActive
                          ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-semibold shadow-xs"
                          : "bg-[#f4f1eb] text-[var(--ink)] border-[var(--hair)] hover:border-[var(--ink)]"
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: b.badgeColor }}
                      />
                      <span>{b.label}</span>
                      <span className="opacity-70">({count})</span>
                    </button>
                  );
                })}
              </div>

              {/* Subfolder Sections */}
              <div className="space-y-6">
                {IN_PROGRESS_BUCKETS.filter(
                  (b) => activeBucketFilter === "all" || activeBucketFilter === b.key,
                ).map((bucketSpec) => {
                  const bucketFiles = activeSong.filesByBucket[bucketSpec.key] ?? [];
                  return (
                    <div
                      key={bucketSpec.key}
                      className="rounded-2xl bg-[#f4f1eb]/85 border border-[var(--hair)] p-3.5 sm:p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="mono-meta text-[9px] uppercase px-2.5 py-1 rounded-lg font-bold text-white"
                            style={{ background: bucketSpec.badgeColor }}
                          >
                            /{bucketSpec.key}
                          </span>
                          <span className="text-sm font-semibold text-[var(--ink)]">
                            {bucketSpec.label}
                          </span>
                          <span className="mono-meta text-[9px] uppercase text-[var(--ink-soft)] hidden sm:inline">
                            · {bucketSpec.desc}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="mono-meta text-[9px] uppercase text-[var(--ink-soft)]">
                            {bucketFiles.length} {bucketFiles.length === 1 ? "file" : "files"}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              triggerSongBucketUpload(activeSong.songFolder.id, bucketSpec.key)
                            }
                            className="px-2.5 py-1 rounded-xl bg-[var(--card)] border border-[var(--hair)] hover:border-[var(--ink)] mono-meta text-[9px] uppercase text-[var(--ink)] cursor-pointer transition"
                          >
                            + Add {bucketSpec.shortLabel}
                          </button>
                        </div>
                      </div>

                      {bucketFiles.length === 0 ? (
                        <div className="px-4 py-5 rounded-xl bg-[var(--card)]/60 border border-dashed border-[var(--hair)] text-center mono-meta text-[10px] uppercase text-[var(--ink-soft)]">
                          No {bucketSpec.label.toLowerCase()} files yet — drop stems or click + Add{" "}
                          {bucketSpec.shortLabel}
                        </div>
                      ) : (
                        <div
                          className={
                            fileLayout === "grid"
                              ? "grid grid-cols-1 lg:grid-cols-2 gap-3"
                              : "flex flex-col gap-2.5"
                          }
                        >
                          {bucketFiles.map((file, idx) => (
                            <div key={file.id} className="space-y-1">
                              <StudioFileCard
                                file={file}
                                idx={idx}
                                isPlaying={playingFileId === file.id}
                                playProgress={playProgress}
                                parentFolderTheme={{
                                  ...parentFolderTheme,
                                  accentPrimary: bucketSpec.badgeColor,
                                }}
                                otherUserName={otherUserName}
                                vaultMembers={vaultMembers}
                                currentUser={currentUser}
                                onTogglePlay={onTogglePlay}
                                onDownload={onDownload}
                                onOpenPopover={onOpenPopover}
                              />
                              {/* Quick Stem Re-Route Bar so Producer/Artist can move a misnamed stem in 1 click */}
                              <div className="flex items-center justify-end gap-1 px-2">
                                <span className="mono-meta text-[8px] uppercase text-[var(--ink-soft)] mr-1">
                                  Subfolder:
                                </span>
                                {IN_PROGRESS_BUCKETS.map((targetB) => {
                                  const isCurrent = targetB.key === bucketSpec.key;
                                  return (
                                    <button
                                      key={targetB.key}
                                      type="button"
                                      disabled={isCurrent}
                                      onClick={() =>
                                        onMoveFileToBucket(
                                          file,
                                          activeSong.songFolder.id,
                                          targetB.key,
                                        )
                                      }
                                      className={`mono-meta text-[8px] uppercase px-1.5 py-0.5 rounded cursor-pointer transition ${
                                        isCurrent
                                          ? "bg-[var(--ink)] text-[var(--bg)] font-bold cursor-default"
                                          : "bg-[var(--card)] text-[var(--ink-soft)] hover:text-[var(--ink)] border border-[var(--hair)]"
                                      }`}
                                    >
                                      {targetB.shortLabel}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
