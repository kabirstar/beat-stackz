import type { FileItem, Folder, User, VaultMember } from "@bpackz/shared";
import { formatBytes, parseStudioFileDisplay } from "../utils/format.ts";
import {
  describeFileMeta,
  resolveFileOwnerName,
  resolveFolderCover,
  type FolderUiMeta,
  type TrashedFileEntry,
} from "../vaultTheme.ts";
import {
  ConfirmDetails,
  CoverTile,
  folderIconName,
  StudioIcon,
  UserAvatarBadge,
} from "./StudioPrimitives.tsx";

export type FileLayoutMode = "cards" | "grid";

/** Track length from the file's `durationMs`; a dash when the server has none. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "–";
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export const countFiles = (n: number) => `${n} file${n === 1 ? "" : "s"}`;

interface TrackHandlers {
  playingFileId: string | null;
  isPaused?: boolean;
  vaultMembers?: VaultMember[];
  currentUser?: User | null;
  onTogglePlay: (file: FileItem) => void;
  onOpenPopover: (file: FileItem) => void;
  onRetryUpload?: () => void;
}

/** One file as a table row: # / title + raw name / by / details / size / actions / length. */
export function TrackRow({
  file,
  idx,
  playingFileId,
  isPaused = false,
  vaultMembers,
  currentUser,
  onTogglePlay,
  onOpenPopover,
  onRetryUpload,
}: TrackHandlers & { file: FileItem; idx: number }) {
  const { cleanTitle } = parseStudioFileDisplay(file.name);
  const ownerName = resolveFileOwnerName(file.createdBy, vaultMembers, currentUser);
  const status = file.status ?? "ready";
  const isCurrent = playingFileId === file.id && status === "ready";
  const title = (
    <>
      <b>
        {cleanTitle}
        {status === "processing" && <span className="bs-status">Processing</span>}
        {status === "failed" && (
          <span className="bs-status bs-status-failed">Upload failed, try again</span>
        )}
      </b>
      <small>
        {file.name}
        <i> · {formatBytes(file.size)}</i>
      </small>
    </>
  );

  return (
    <div className="bs-tr" aria-current={isCurrent ? "true" : undefined}>
      <span className="bs-num">
        {isCurrent && !isPaused ? (
          <span className="bs-eq" role="img" aria-label="Playing">
            <i />
            <i />
            <i />
          </span>
        ) : (
          idx + 1
        )}
      </span>
      {status === "processing" ? (
        <span className="bs-tt">{title}</span>
      ) : status === "failed" ? (
        <button type="button" className="bs-tt" title="Try the upload again" onClick={onRetryUpload}>
          {title}
        </button>
      ) : (
        <button
          type="button"
          className="bs-tt"
          title={isCurrent && !isPaused ? "Pause" : "Play"}
          onClick={() => onTogglePlay(file)}
        >
          {title}
        </button>
      )}
      <span className="bs-by">
        <UserAvatarBadge byName={ownerName} sizeClass="w-[18px] h-[18px] text-[9px]" />
        {ownerName}
      </span>
      <span className="bs-det">{describeFileMeta(file)}</span>
      <span className="bs-sz">{formatBytes(file.size)}</span>
      <span className="bs-ra">
        <button
          type="button"
          className="bs-ib"
          aria-label={`Share ${cleanTitle}`}
          onClick={() => onOpenPopover(file)}
        >
          <StudioIcon name="share" className="bs-icon" />
        </button>
        <button
          type="button"
          className="bs-ib"
          aria-label={`More for ${cleanTitle}: rename, download, share, trash`}
          onClick={() => onOpenPopover(file)}
        >
          <StudioIcon name="more" className="bs-icon" />
        </button>
      </span>
      <span className="bs-du">{formatDuration(file.durationMs)}</span>
    </div>
  );
}

export function TrackTable({
  files,
  grid = false,
  ...handlers
}: TrackHandlers & { files: FileItem[]; grid?: boolean }) {
  return (
    <div className={grid ? "bs-tracks-grid" : undefined}>
      <div className="bs-th bs-label" aria-hidden="true">
        <span>#</span>
        <span>Title</span>
        <span>By</span>
        <span>Details</span>
        <span>Size</span>
        <span />
        <StudioIcon name="clock" className="bs-icon" />
      </div>
      {files.map((f, idx) => (
        <TrackRow key={f.id} file={f} idx={idx} {...handlers} />
      ))}
    </div>
  );
}

interface SectionHandlers extends TrackHandlers {
  folderMetaMap: Record<string, FolderUiMeta>;
  /** Owner filter chosen in the crumbs bar; `whoLabel` names it for the empty state. */
  showFile: (file: FileItem) => boolean;
  whoLabel: string;
  grid: boolean;
  onUploadTo: (folderId: string) => void;
  onRenameFolder: (folder: Folder) => void;
  onTrashFolder: (folder: Folder) => void;
}

/** One folder shown like an album: cover, title, count and size, actions, then its tracks. */
export function AlbumSection({
  folder,
  parent = null,
  files,
  folderMetaMap,
  showFile,
  whoLabel,
  grid,
  onUploadTo,
  onRenameFolder,
  onTrashFolder,
  ...handlers
}: SectionHandlers & { folder: Folder; parent?: Folder | null; files: FileItem[] }) {
  const cover = resolveFolderCover(folder, folderMetaMap, parent);
  const shown = files.filter(showFile);
  const firstPlayable = shown.find(
    (f) => (f.status ?? "ready") === "ready" && parseStudioFileDisplay(f.name).isAudio,
  );
  const bytes = files.reduce((n, f) => n + f.size, 0);
  return (
    <section className="bs-sec" aria-label={folder.name}>
      <div className="bs-sec-h">
        <CoverTile icon={folderIconName(cover.iconKey)} color={cover.color} size="bs-cv-lg" />
        <div className="bs-sec-t">
          <h2 className="bs-h2">{folder.name}</h2>
          <span className="bs-label">
            {parent ? "Subfolder" : "Folder"} · {countFiles(files.length)} · {formatBytes(bytes)}
          </span>
          <div className="bs-sec-a">
            <button
              type="button"
              className="bs-pb"
              aria-label={`Play ${folder.name}`}
              disabled={!firstPlayable}
              onClick={() => firstPlayable && handlers.onTogglePlay(firstPlayable)}
            >
              <StudioIcon name="play" className="bs-icon" />
            </button>
            <button
              type="button"
              className="bs-ib"
              aria-label={`Upload to ${folder.name}`}
              onClick={() => onUploadTo(folder.id)}
            >
              <StudioIcon name="upload" className="bs-icon" />
            </button>
            <details className="bs-more">
              <summary className="bs-ib" aria-label={`More for ${folder.name}`}>
                <StudioIcon name="more" className="bs-icon" />
              </summary>
              <div className="bs-menu">
                <button type="button" className="bs-li" onClick={() => onRenameFolder(folder)}>
                  Rename folder
                </button>
                {folder.kind === null && (
                  <ConfirmDetails
                    summary={<span className="text-[var(--error)]">Move folder to Trash</span>}
                    summaryClass="bs-li"
                    question={`Move ${folder.name} to Trash?`}
                    keepText="Keep folder"
                    yesText="Yes, move to Trash"
                    onYes={() => onTrashFolder(folder)}
                  />
                )}
              </div>
            </details>
          </div>
        </div>
      </div>
      {shown.length > 0 ? (
        <TrackTable files={shown} grid={grid} {...handlers} />
      ) : (
        <p className="bs-empty">
          {files.length > 0
            ? `Nothing from ${whoLabel} here.`
            : "Empty folder. Tap upload to add stems or masters."}
        </p>
      )}
    </section>
  );
}

/** A folder opened in the centre pane: one album section per non-empty subfolder, empty ones as pills. */
export function FolderView({
  root,
  sub,
  subfolders,
  filesByFolder,
  onSelectSubfolder,
  onOpenCreateSubfolder,
  ...section
}: SectionHandlers & {
  root: Folder;
  sub: Folder | null;
  subfolders: Folder[];
  filesByFolder: Record<string, FileItem[]>;
  onSelectSubfolder: (subId: string) => void;
  onOpenCreateSubfolder: () => void;
}) {
  if (sub) {
    return (
      <AlbumSection folder={sub} parent={root} files={filesByFolder[sub.id] ?? []} {...section} />
    );
  }
  const rootFiles = filesByFolder[root.id] ?? [];
  const full = subfolders.filter((sf) => (filesByFolder[sf.id] ?? []).length > 0);
  const empty = subfolders.filter((sf) => !full.includes(sf));
  return (
    <>
      {(rootFiles.length > 0 || subfolders.length === 0) && (
        <AlbumSection folder={root} files={rootFiles} {...section} />
      )}
      {full.map((sf) => (
        <AlbumSection key={sf.id} folder={sf} parent={root} files={filesByFolder[sf.id]} {...section} />
      ))}
      {subfolders.length > 0 && full.length === 0 && rootFiles.length === 0 && (
        <p className="bs-empty">Nothing in this folder yet.</p>
      )}
      <div className="bs-emp">
        {empty.length > 0 && <span>Empty subfolders:</span>}
        {empty.map((sf) => (
          <button key={sf.id} type="button" className="bs-pill" onClick={() => onSelectSubfolder(sf.id)}>
            {sf.name}
          </button>
        ))}
        <button type="button" className="bs-pill" onClick={onOpenCreateSubfolder}>
          + Subfolder
        </button>
      </div>
    </>
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
                  <StudioIcon name="replay" className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
