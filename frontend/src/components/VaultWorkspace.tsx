import type { ReactNode } from "react";
import type { FileItem, Folder, User, Vault, VaultMember } from "@bpackz/shared";
import type { InProgressBucketKey } from "../utils/inProgressAutoRouter.ts";
import {
  COVER_COLORS,
  describeFileMeta,
  resolveFileOwnerName,
  resolveFolderUiMeta,
  type PersistedUiMeta,
  type TrashedFileEntry,
  type VaultLook,
  type VisionBoardVaultState,
} from "../vaultTheme.ts";
import {
  InProgressSection,
  type InProgressSongEcosystem,
  type LastAutoRouteSummary,
} from "./InProgressSection.tsx";
import {
  buildLibraryItems,
  filesUnder,
  LibraryPanel,
  type LibraryItem,
  type LibraryPill,
} from "./LibraryPanel.tsx";
import { SharedPanel } from "./SharedPanel.tsx";
import {
  countFiles,
  FolderView,
  TrackTable,
  TrashSection,
  type FileLayoutMode,
} from "./StudioFileSection.tsx";
import { CoverGridSection, CoverTile, UserAvatarBadge } from "./StudioPrimitives.tsx";
import { PlusActionMenu } from "./VaultModals.tsx";
import { MobileDock, ProfileMenu, VaultTopBar } from "./VaultTopBar.tsx";
import { VisionBoardCanvas } from "./VisionBoardCanvas.tsx";

/** Files anywhere in the vault whose name or details contain `query` (already trimmed and lower-cased). */
export function searchFiles(filesByFolder: Record<string, FileItem[]>, query: string): FileItem[] {
  if (!query) return [];
  return Object.values(filesByFolder)
    .flat()
    .filter(
      (f) =>
        f.name.toLowerCase().includes(query) || describeFileMeta(f).toLowerCase().includes(query),
    );
}

/** The "who added it" filter cycles All, then each name, then back to All (null). */
export function nextWho(current: string | null, names: string[]): string | null {
  return names[(current === null ? -1 : names.indexOf(current)) + 1] ?? null;
}

/** The line under a folder card: what it is for, and how many files sit in it. */
export function describeFolderCard(
  folder: Folder,
  folderMeta: PersistedUiMeta["folderMeta"],
  subfoldersByRoot: Record<string, Folder[]>,
  filesByFolder: Record<string, FileItem[]>,
): string {
  const meta = resolveFolderUiMeta(folder, folderMeta);
  return ["vision_board", "in_progress"].includes(meta.iconKey)
    ? meta.by
    : `${meta.by} · ${countFiles(filesUnder(folder, subfoldersByRoot, filesByFolder))}`;
}

type Handler<A extends unknown[] = []> = (...args: A) => unknown;

export interface VaultWorkspaceProps {
  children?: ReactNode;
  user: User | null;
  authLoading: boolean;
  toast: string | null;
  look: VaultLook;
  uiMeta: PersistedUiMeta;

  vaults: Vault[];
  activeVault: Vault | null;
  isSharedMode: boolean;
  vaultMembers: VaultMember[];
  /** Root folders, plus stand-ins for Vision Board and In Progress when the vault has no such folder. */
  roots: Folder[];
  subfoldersByRoot: Record<string, Folder[]>;
  filesByFolder: Record<string, FileItem[]>;
  currentRootFolder: Folder | null;
  currentSubFolder: Folder | null;
  currentSubfolders: Folder[];
  trashedList: TrashedFileEntry[];

  viewingTrash: boolean;
  viewingInProgress: boolean;
  viewingVisionBoard: boolean;
  search: string;
  whoFilter: string | null;
  fileLayout: FileLayoutMode;
  libraryPill: LibraryPill | null;
  sharedOpen: boolean;
  profileOpen: boolean;
  plusMenuOpen: boolean;
  inviteEmail: string;
  inviteRole: "editor" | "viewer";

  playingFile: FileItem | null;
  isPaused: boolean;
  playProgress: number;

  inProgressSongs: InProgressSongEcosystem[];
  activeInProgressSongId: string | null;
  activeInProgressBucket: "all" | InProgressBucketKey;
  inProgressImporting: boolean;
  inProgressStatusText: string | null;
  lastRouteSummary: LastAutoRouteSummary | null;
  visionBoard: VisionBoardVaultState;

  setSearch: (v: string) => void;
  setWhoFilter: (v: string | null) => void;
  setFileLayout: (v: FileLayoutMode) => void;
  setLibraryPill: (v: LibraryPill | null) => void;
  setSharedOpen: (v: boolean) => void;
  setProfileOpen: (v: boolean) => void;
  setPlusMenuOpen: (v: boolean) => void;
  setViewingTrash: (v: boolean) => void;
  setInProgressOpen: (v: boolean) => void;
  setVisionBoardOpen: (v: boolean) => void;
  setCreatingFolder: (v: boolean) => void;
  setCreatingSharedVault: (v: boolean) => void;
  setInviteEmail: (v: string) => void;
  setInviteRole: (v: "editor" | "viewer") => void;
  setActiveInProgressSongId: (v: string | null) => void;
  setActiveInProgressBucket: (v: "all" | InProgressBucketKey) => void;

  onGoVaultHome: Handler;
  onOpenFolder: Handler<[rootId: string, subId: string | null]>;
  onSwitchVault: Handler<[vaultId: string]>;
  onPlayFileId: Handler<[fileId: string]>;
  onChangeLook: Handler<[look: VaultLook]>;
  onSignOut: Handler;
  onReorderFolder: Handler<[sourceId: string, targetId: string]>;
  /** Opens the file picker; `null` uploads to the folder that is open. */
  onUploadTo: Handler<[folderId: string | null]>;
  onRenameFolder: Handler<[folder: Folder]>;
  onTrashFolder: Handler<[folder: Folder]>;
  onTogglePlay: Handler<[file: FileItem]>;
  onOpenPopover: Handler<[file: FileItem]>;
  onRestoreFromTrash: Handler<[entry: TrashedFileEntry]>;
  onInviteMember: Handler;
  onRemoveMember: Handler<[userId: string]>;
  onRenameVault: Handler<[name: string]>;
  onUpdateVisionBoard: Handler<[next: VisionBoardVaultState]>;
  onImportSessionFiles: Handler<[files: File[], title?: string, container?: string | null]>;
  onCreateEmptySong: Handler<[title: string]>;
  onSpawnDemoFlSession: Handler<[title?: string]>;
  onUploadToSongBucket: Handler<
    [songFolderId: string, bucket: InProgressBucketKey | "auto", files: File[]]
  >;
  onMoveFileToBucket: Handler<[file: FileItem, songFolderId: string, bucket: InProgressBucketKey]>;
  onRenameSong: Handler<[songFolder: Folder]>;
  onTrashSong: Handler<[songFolder: Folder]>;
}

const VIEW_HEAD = {
  trash: ["Trash", "30-day recovery"],
  progress: ["In Progress", "song ecosystems · beat · main · bg · adlib · demo · mixed"],
  board: ["Vision Board", "notes · songs · threads"],
  search: ["Search", ""],
} as const;

/**
 * Everything on screen once you are in: top bar, the "Your Vault" list, the centre pane, the Shared
 * panel and the phone dock. Hook-free; `App` owns the state and passes its modals and player as children.
 */
export function VaultWorkspace(p: VaultWorkspaceProps) {
  const folderMeta = p.uiMeta.folderMeta;
  const query = p.search.trim().toLowerCase();
  const view = p.viewingTrash
    ? "trash"
    : p.viewingInProgress
      ? "progress"
      : p.viewingVisionBoard
        ? "board"
        : query
          ? "search"
          : p.currentRootFolder
            ? "folder"
            : "home";
  const root = p.currentRootFolder;
  const sub = p.currentSubFolder;
  const vaultName = p.activeVault?.name ?? "Vault";
  const matches = searchFiles(p.filesByFolder, query);
  const allFiles = Object.values(p.filesByFolder).flat();
  const whoNames = [
    ...new Set(allFiles.map((f) => resolveFileOwnerName(f.createdBy, p.vaultMembers, p.user))),
  ];
  const grid = p.fileLayout === "grid";
  const people = p.isSharedMode
    ? p.vaultMembers.map((m) => m.name || m.email.split("@")[0] || "Member")
    : [p.user?.name ?? "Swish"];

  const library = {
    roots: p.roots,
    subfoldersByRoot: p.subfoldersByRoot,
    filesByFolder: p.filesByFolder,
    vaults: p.vaults,
    folderMeta,
    recents: p.uiMeta.recents ?? [],
    vaultMembers: p.vaultMembers,
    user: p.user,
  };
  const openItem = (item: LibraryItem) =>
    item.action === "vault"
      ? p.onSwitchVault(item.id)
      : item.action === "play"
        ? p.onPlayFileId(item.id)
        : p.onOpenFolder(item.parentId ?? item.id, item.parentId ? item.id : null);

  const toggles = {
    viewingInProgress: p.viewingInProgress,
    viewingVisionBoard: p.viewingVisionBoard,
    viewingTrash: p.viewingTrash,
    sharedOpen: p.sharedOpen,
    isSharedMode: p.isSharedMode,
    inProgressCount: p.inProgressSongs.length,
    trashedCount: p.trashedList.length,
    onGoVaultHome: p.onGoVaultHome,
    onToggleInProgress: () => [p.onGoVaultHome(), p.setInProgressOpen(!p.viewingInProgress)],
    onToggleVisionBoard: () => [p.onGoVaultHome(), p.setVisionBoardOpen(!p.viewingVisionBoard)],
    onToggleTrash: () => [p.onGoVaultHome(), p.setViewingTrash(!p.viewingTrash)],
    onToggleShared: () => p.setSharedOpen(!p.sharedOpen),
  };
  const tracks = {
    playingFileId: p.playingFile?.id ?? null,
    isPaused: p.isPaused,
    vaultMembers: p.vaultMembers,
    currentUser: p.user,
    onTogglePlay: p.onTogglePlay,
    onOpenPopover: p.onOpenPopover,
    onRetryUpload: () => p.onUploadTo(null),
  };

  return (
    <div className="bs-device vault-main-enter">
      <div className="bs-app">
        <VaultTopBar
          user={p.user}
          search={p.search}
          profileOpen={p.profileOpen}
          onSearchChange={p.setSearch}
          onToggleProfile={() => p.setProfileOpen(!p.profileOpen)}
          {...toggles}
        />

        <div className="bs-body">
          <LibraryPanel
            items={buildLibraryItems({ ...library, pill: p.libraryPill })}
            pill={p.libraryPill}
            currentKeys={[
              `go:${sub?.id ?? root?.id}`,
              `vault:${p.activeVault?.id}`,
              `play:${p.playingFile?.id}`,
            ]}
            onChangePill={p.setLibraryPill}
            onOpenItem={openItem}
            onOpenNewMenu={() => p.setPlusMenuOpen(true)}
          />

          <main className="bs-main">
            <nav className="bs-crumbs" aria-label="Breadcrumb">
              <button type="button" onClick={p.onGoVaultHome}>
                {vaultName}
              </button>
              {view !== "home" && <span className="bs-sep">/</span>}
              {view !== "home" && view !== "folder" && <span>{VIEW_HEAD[view][0]}</span>}
              {view === "folder" && root && !sub && <span aria-current="page">{root.name}</span>}
              {view === "folder" && root && sub && (
                <>
                  <button type="button" onClick={() => p.onOpenFolder(root.id, null)}>
                    {root.name}
                  </button>
                  <span className="bs-sep">/</span>
                  <span aria-current="page">{sub.name}</span>
                </>
              )}
              {view === "folder" && (
                <span className="bs-ctl">
                  <button
                    type="button"
                    aria-label={`Added by: ${p.whoFilter ?? "everyone"}. Change`}
                    onClick={() => p.setWhoFilter(nextWho(p.whoFilter, whoNames))}
                  >
                    {p.whoFilter ?? "All"} ▾
                  </button>
                  <button
                    type="button"
                    aria-label={`Layout: ${p.fileLayout}. Change`}
                    onClick={() => p.setFileLayout(grid ? "cards" : "grid")}
                  >
                    {grid ? "Grid" : "Cards"}
                  </button>
                </span>
              )}
            </nav>

            {view === "home" && (
              <>
                <div className="bs-hh">
                  <h1 className="bs-h1">The Vault</h1>
                  <p className="bs-sub">
                    {people.slice(0, 4).map((name) => (
                      <UserAvatarBadge key={name} byName={name} sizeClass="w-5 h-5 text-[9px]" />
                    ))}
                    {p.isSharedMode ? "Shared vault" : "Personal vault"} · {people.join(", ")}
                  </p>
                </div>
                <div className="bs-recents">
                  {buildLibraryItems({ ...library, pill: null })
                    .slice(0, 6)
                    .map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className="bs-rt"
                        onClick={() => openItem(item)}
                      >
                        <CoverTile icon={item.icon} color={item.color} />
                        <b>{item.name}</b>
                      </button>
                    ))}
                </div>
                {!p.authLoading && (
                  <CoverGridSection
                    folders={p.roots}
                    folderMetaMap={folderMeta}
                    describeFolder={(f) =>
                      describeFolderCard(f, folderMeta, p.subfoldersByRoot, p.filesByFolder)
                    }
                    onSelectFolder={(id) => p.onOpenFolder(id, null)}
                    onReorderFolder={p.onReorderFolder}
                    onCreateClick={() => p.setCreatingFolder(true)}
                  />
                )}
              </>
            )}

            {view !== "home" && view !== "folder" && (
              <div className="bs-hh">
                <h1 className="bs-h1">{VIEW_HEAD[view][0]}</h1>
                <p className="bs-sub">
                  {view === "search"
                    ? `${matches.length} matching ${matches.length === 1 ? "file" : "files"} across vault`
                    : VIEW_HEAD[view][1]}
                </p>
              </div>
            )}

            {view === "search" && <TrackTable files={matches} {...tracks} />}

            {view === "folder" && root && (
              <FolderView
                root={root}
                sub={sub}
                subfolders={p.currentSubfolders}
                filesByFolder={p.filesByFolder}
                onSelectSubfolder={(id) => p.onOpenFolder(root.id, id)}
                onOpenCreateSubfolder={() => p.setCreatingFolder(true)}
                folderMetaMap={folderMeta}
                showFile={(f) =>
                  !p.whoFilter ||
                  resolveFileOwnerName(f.createdBy, p.vaultMembers, p.user) === p.whoFilter
                }
                whoLabel={p.whoFilter ?? "anyone"}
                grid={grid}
                onUploadTo={p.onUploadTo}
                onRenameFolder={p.onRenameFolder}
                onTrashFolder={p.onTrashFolder}
                {...tracks}
              />
            )}

            {view === "trash" && (
              <TrashSection trashedList={p.trashedList} onRestore={p.onRestoreFromTrash} />
            )}

            {view === "progress" && (
              <InProgressSection
                songs={p.inProgressSongs}
                activeSongId={p.activeInProgressSongId}
                activeBucketFilter={p.activeInProgressBucket}
                isImporting={p.inProgressImporting}
                importStatusText={p.inProgressStatusText}
                lastRouteSummary={p.lastRouteSummary}
                fileLayout={p.fileLayout}
                playingFileId={tracks.playingFileId}
                isPaused={p.isPaused}
                accentColor={COVER_COLORS[6]}
                vaultMembers={p.vaultMembers}
                currentUser={p.user}
                onSelectSong={p.setActiveInProgressSongId}
                onSelectBucketFilter={p.setActiveInProgressBucket}
                onImportSessionFiles={p.onImportSessionFiles}
                onCreateEmptySong={p.onCreateEmptySong}
                onSpawnDemoFlSession={p.onSpawnDemoFlSession}
                onUploadToSongBucket={p.onUploadToSongBucket}
                onMoveFileToBucket={p.onMoveFileToBucket}
                onRenameSong={p.onRenameSong}
                onTrashSong={p.onTrashSong}
                onChangeFileLayout={p.setFileLayout}
                onTogglePlay={p.onTogglePlay}
                onOpenPopover={p.onOpenPopover}
              />
            )}

            {view === "board" && (
              <VisionBoardCanvas
                boardState={p.visionBoard}
                vaultFiles={allFiles}
                currentUserName={p.user?.name ?? "Swish"}
                playingFileId={tracks.playingFileId}
                playProgress={p.playProgress}
                accentColor={COVER_COLORS[5]}
                onUpdateBoard={p.onUpdateVisionBoard}
                onTogglePlayFile={p.onPlayFileId}
                onUploadSongToBoard={() => p.onUploadTo(null)}
              />
            )}
          </main>

          {p.sharedOpen && (
            <SharedPanel
              activeVault={p.activeVault}
              vaults={p.vaults}
              vaultMembers={p.vaultMembers}
              inviteEmail={p.inviteEmail}
              inviteRole={p.inviteRole}
              onChangeInviteEmail={p.setInviteEmail}
              onChangeInviteRole={p.setInviteRole}
              onInviteMember={p.onInviteMember}
              onRemoveMember={p.onRemoveMember}
              onRenameVault={p.onRenameVault}
              onSwitchVault={p.onSwitchVault}
              onOpenCreateSharedVault={() => p.setCreatingSharedVault(true)}
              onClose={() => p.setSharedOpen(false)}
            />
          )}
        </div>

        {p.children}

        <MobileDock {...toggles} onOpenPlusMenu={() => p.setPlusMenuOpen(!p.plusMenuOpen)} />

        {p.plusMenuOpen && (
          <PlusActionMenu
            vaultName={vaultName}
            hasRootFolder={Boolean(root)}
            onClose={() => p.setPlusMenuOpen(false)}
            onCreateFolder={() => [p.setPlusMenuOpen(false), p.setCreatingFolder(true)]}
            onUploadFile={() => [p.setPlusMenuOpen(false), p.onUploadTo(null)]}
            onCreateSharedVault={() => [p.setPlusMenuOpen(false), p.setCreatingSharedVault(true)]}
          />
        )}

        {p.profileOpen && (
          <ProfileMenu
            user={p.user}
            look={p.look}
            onChangeLook={p.onChangeLook}
            onSignOut={() => [p.setProfileOpen(false), p.onSignOut()]}
            onClose={() => p.setProfileOpen(false)}
          />
        )}

        {p.toast && (
          <div role="status" className="bs-toast z-[60]">
            {p.toast}
          </div>
        )}
      </div>
    </div>
  );
}
