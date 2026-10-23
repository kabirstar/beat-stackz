import type { Folder, User, Vault } from "@bpackz/shared";
import { MiniFolderSvg, UserAvatarBadge } from "../HardwareIcons.tsx";
import {
  getOrCreateSharedVaultPalette,
  resolveFolderUiMeta,
  type FolderUiMeta,
  type HardwareThemeSlot,
  type PersistedUiMeta,
} from "../vaultTheme.ts";
import { StudioIcon } from "./StudioPrimitives.tsx";

export function VaultHeader({
  user,
  currentUserKey,
  isSharedMode,
  activeVault,
  vaults,
  uiMeta,
  sharedDropdownOpen,
  newSharedVaultName,
  canGoBack,
  viewingTrash,
  currentRootFolder,
  currentSubFolder,
  rootFolders,
  currentSubfolders,
  folderMetaMap,
  activePalette,
  search,
  onSearchChange,
  onBack,
  onGoVaultHome,
  onOpenRoot,
  onOpenSub,
  onToggleSharedDropdown,
  onSwitchSharedVault,
  onManageSharedVaultMembers,
  onChangeNewSharedVaultName,
  onCreateSharedVault,
  onSelectProfile,
  onSignOut,
  onOpenAuthModal,
}: {
  user: User | null;
  currentUserKey: "swish" | "todo";
  isSharedMode: boolean;
  activeVault: Vault | null;
  vaults: Vault[];
  uiMeta: PersistedUiMeta;
  sharedDropdownOpen: boolean;
  newSharedVaultName: string;
  canGoBack: boolean;
  viewingTrash: boolean;
  currentRootFolder: Folder | null;
  currentSubFolder: Folder | null;
  rootFolders: Folder[];
  currentSubfolders: Folder[];
  folderMetaMap: Record<string, FolderUiMeta>;
  activePalette: HardwareThemeSlot[];
  search: string;
  onSearchChange: (val: string) => void;
  onBack: () => void;
  onGoVaultHome: () => void;
  onOpenRoot: (id: string) => void;
  onOpenSub: (id: string) => void;
  onToggleSharedDropdown: () => void;
  onSwitchSharedVault: (vaultId: string) => void;
  onManageSharedVaultMembers: (vaultId: string) => void;
  onChangeNewSharedVaultName: (val: string) => void;
  onCreateSharedVault: () => void;
  onSelectProfile: (key: "swish" | "todo") => void;
  onSignOut: () => void;
  onOpenAuthModal: () => void;
}) {
  const sharedVaults = vaults.filter((v) => v.kind === "shared");
  return (
    <>
      <header className="px-4 sm:px-6 md:px-12 py-2.5 min-h-16 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hair)] bg-[#edeae4]/95 backdrop-blur-md sticky top-0 z-30">
        {/* Left Navigation Icons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={canGoBack ? onBack : undefined}
            title={canGoBack ? "Go Back" : "At Vault Root"}
            className={`icon-btn ${canGoBack ? "icon-btn-active" : "opacity-35 cursor-default"}`}
          >
            <StudioIcon name="back" />
          </button>

          <button
            type="button"
            onClick={onGoVaultHome}
            title="The Vault Home"
            className={`icon-btn ${!currentRootFolder && !viewingTrash ? "icon-btn-active" : ""}`}
          >
            <StudioIcon name="home" />
          </button>

          <span className="w-px h-5 bg-[var(--hair)] mx-1 hidden sm:block" />

          {/* Top Folder Navigation Icon Dock */}
          <div className="hidden sm:flex items-center gap-1">
            {rootFolders.map((folder, idx) => {
              const isCurrentRoot = currentRootFolder?.id === folder.id;
              const fMeta = resolveFolderUiMeta(folder, folderMetaMap, idx);
              const slotTheme =
                activePalette[fMeta.colorSlot % activePalette.length] ?? activePalette[0];
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => onOpenRoot(folder.id)}
                  title={`${folder.name} (${fMeta.by})`}
                  className={`icon-btn w-8 h-8 relative ${isCurrentRoot ? "icon-btn-active" : ""}`}
                  style={
                    isCurrentRoot
                      ? {
                          borderColor: slotTheme.accentPrimary,
                          boxShadow: `0 0 0 2px ${slotTheme.accentPrimary}`,
                        }
                      : undefined
                  }
                >
                  <MiniFolderSvg iconKey={fMeta.iconKey} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative flex-1 min-w-[140px] max-w-xs sm:max-w-sm">
          <span className="text-[var(--ink-soft)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <StudioIcon name="search" />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search folders & tracks..."
            className="w-full pl-10 pr-4 py-2 rounded-full bg-[var(--card)] border border-[var(--hair)] focus:border-[var(--ink)] focus:outline-none text-xs text-[var(--ink)] placeholder:text-[var(--ink-soft)]"
          />
        </div>

        {/* Right Icon Bar */}
        <div className="flex items-center gap-2 relative">
          <div className="relative">
            <button
              type="button"
              onClick={onToggleSharedDropdown}
              title={`Shared Vaults (${sharedVaults.length})`}
              className={`icon-btn relative ${
                isSharedMode || sharedDropdownOpen ? "icon-btn-active" : ""
              }`}
            >
              <StudioIcon name="users" />
              {isSharedMode && (
                <span className="w-2 h-2 rounded-full bg-[#00e5ff] absolute -top-0.5 -right-0.5" />
              )}
            </button>

            {sharedDropdownOpen && (
              <div className="absolute right-0 top-12 z-50 w-72 sm:w-80 rounded-2xl bg-[#edeae4]/98 backdrop-blur-xl border border-[var(--ink)]/25 shadow-2xl overflow-hidden popover-sheet">
                <div className="px-3.5 py-2.5 bg-[var(--card)] border-b border-[var(--hair)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="mono-meta text-[10px] uppercase text-[var(--ink)] font-semibold">
                      Shared Vaults
                    </span>
                    <span className="mono-meta text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--card-deep)] text-[var(--ink)]">
                      {sharedVaults.length}
                    </span>
                  </div>
                  {isSharedMode && (
                    <button
                      type="button"
                      onClick={() => onSelectProfile(currentUserKey)}
                      className="mono-meta text-[9px] uppercase px-2 py-1 rounded-full bg-[var(--ink)] text-[var(--bg)] cursor-pointer hover:opacity-90 transition"
                    >
                      ← {user?.name ?? "Swish"}&apos;s Vault
                    </button>
                  )}
                </div>

                <div className="p-2 max-h-64 overflow-y-auto space-y-1.5">
                  {sharedVaults.map((sv) => {
                    const isCurrent = isSharedMode && activeVault?.id === sv.id;
                    const svPalette = getOrCreateSharedVaultPalette(sv.id, uiMeta);
                    const primaryColor = svPalette[0]?.accentPrimary ?? "#00e5ff";
                    const chassisBg = svPalette[0]?.chassisBg ?? "#141418";

                    return (
                      <div
                        key={sv.id}
                        className={`flex items-center justify-between gap-2 p-2 rounded-xl border transition ${
                          isCurrent
                            ? "bg-white border-[var(--ink)] shadow-sm"
                            : "bg-[#f4f1eb] border-[var(--hair)] hover:border-[var(--ink)]/50"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSwitchSharedVault(sv.id)}
                          className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                        >
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
                            style={{
                              background: chassisBg,
                              border: `2px solid ${primaryColor}`,
                            }}
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ background: primaryColor }}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-[var(--ink)] truncate">
                                {sv.name}
                              </span>
                              {isCurrent && (
                                <span className="mono-meta text-[8px] uppercase px-1.5 py-0.5 rounded-full bg-[var(--ink)] text-[var(--bg)] shrink-0">
                                  Active
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="inline-flex -space-x-1">
                                <UserAvatarBadge
                                  byName="Swish"
                                  sizeClass="w-3.5 h-3.5 text-[7px]"
                                />
                                <UserAvatarBadge
                                  byName="Todo"
                                  sizeClass="w-3.5 h-3.5 text-[7px]"
                                />
                              </span>
                              <span className="mono-meta text-[9px] text-[var(--ink-soft)] truncate">
                                Swish · Todo
                              </span>
                            </div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => onManageSharedVaultMembers(sv.id)}
                          title={`Manage collaborators in ${sv.name}`}
                          className="icon-btn w-7 h-7 shrink-0"
                        >
                          <StudioIcon name="user-plus" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="p-2.5 bg-[var(--card)] border-t border-[var(--hair)] space-y-2">
                  <div className="mono-meta text-[9px] uppercase text-[var(--ink-soft)]">
                    Create New Shared Vault
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newSharedVaultName}
                      onChange={(e) => onChangeNewSharedVaultName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onCreateSharedVault();
                      }}
                      placeholder="e.g. Late Night Tape..."
                      className="flex-1 px-3 py-1.5 rounded-xl bg-[#f4f1eb] border border-[var(--hair)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)]"
                    />
                    <button
                      type="button"
                      onClick={onCreateSharedVault}
                      title="Create Shared Vault (Random Color Scheme)"
                      className="px-3 py-1.5 rounded-xl bg-[var(--ink)] text-[var(--bg)] mono-meta text-[10px] uppercase cursor-pointer hover:opacity-90 transition shrink-0"
                    >
                      + Create
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {user ? (
            <>
              <button
                type="button"
                onClick={() => onSelectProfile(currentUserKey)}
                title={`${user.name ?? user.email}'s Personal Vault`}
                className="icon-btn relative font-semibold text-xs uppercase"
                style={
                  currentUserKey === "todo"
                    ? !isSharedMode
                      ? {
                          background: "#111114",
                          color: "#fafafa",
                          borderColor: "#111114",
                          boxShadow: "0 0 0 2px #16132b",
                        }
                      : {
                          background: "linear-gradient(135deg, #ffffff 50%, #d4d4d8 50%)",
                          color: "#111114",
                        }
                    : !isSharedMode
                      ? {
                          background: "#0b0a0c",
                          color: "#ef4444",
                          borderColor: "#dc2626",
                          boxShadow: "0 0 0 2px #0b0a0c",
                        }
                      : {
                          background: "#181416",
                          color: "#ef4444",
                          borderColor: "rgba(220,38,38,0.45)",
                        }
                }
              >
                {(user.name || user.email || "V").trim().charAt(0).toUpperCase()}
              </button>

              <button
                type="button"
                onClick={onSignOut}
                title={`Sign out (${user.name ?? user.email})`}
                className="icon-btn"
              >
                <StudioIcon name="sign-out" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onOpenAuthModal}
              title="Sign in"
              className="icon-btn icon-btn-active"
            >
              <StudioIcon name="sign-in" />
            </button>
          )}
        </div>
      </header>

      {canGoBack && (
        <nav className="px-4 sm:px-6 md:px-12 py-2 border-b border-[var(--hair)] bg-[var(--card)]/75 backdrop-blur-sm sticky top-16 z-20 flex items-center justify-between gap-3 overflow-x-auto">
          <div className="flex items-center gap-1.5 min-w-max">
            <button
              type="button"
              onClick={onBack}
              title="Back one level"
              className="icon-btn w-8 h-8 icon-btn-active mr-1"
            >
              <StudioIcon name="back" />
            </button>

            {rootFolders.map((folder, idx) => {
              const active = currentRootFolder?.id === folder.id;
              const fMeta = resolveFolderUiMeta(folder, folderMetaMap, idx);
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => onOpenRoot(folder.id)}
                  className={`px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5 cursor-pointer border transition ${
                    active
                      ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-medium"
                      : "bg-[var(--bg)] text-[var(--ink-soft)] border-[var(--hair)] hover:text-[var(--ink)]"
                  }`}
                >
                  <MiniFolderSvg iconKey={fMeta.iconKey} />
                  <span>{folder.name}</span>
                </button>
              );
            })}

            {currentSubfolders.length > 0 && (
              <>
                <span className="text-[var(--ink-soft)] mx-1 shrink-0">
                  <StudioIcon name="chevron-right" className="w-3.5 h-3.5" />
                </span>
                {currentSubfolders.map((sf, idx) => {
                  const subActive = currentSubFolder?.id === sf.id;
                  const sfMeta = resolveFolderUiMeta(sf, folderMetaMap, idx);
                  return (
                    <button
                      key={sf.id}
                      type="button"
                      onClick={() => onOpenSub(sf.id)}
                      className={`px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5 cursor-pointer border transition ${
                        subActive
                          ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-medium"
                          : "bg-[var(--card-deep)] text-[var(--ink)] border-[var(--hair)] hover:border-[var(--ink)]"
                      }`}
                    >
                      <MiniFolderSvg iconKey={sfMeta.iconKey} />
                      <span>{sf.name}</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </nav>
      )}

      {canGoBack && (
        <button
          type="button"
          onClick={onBack}
          title="Back"
          className="fixed left-3 sm:left-5 top-1/2 -translate-y-1/2 z-30 icon-btn w-11 h-11 icon-btn-active shadow-xl"
        >
          <StudioIcon name="back" className="w-5 h-5" />
        </button>
      )}
    </>
  );
}
