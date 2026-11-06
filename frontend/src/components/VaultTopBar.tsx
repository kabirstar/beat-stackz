import type { User } from "@bpackz/shared";
import type { VaultLook } from "../vaultTheme.ts";
import { StudioIcon, UserAvatarBadge } from "./StudioPrimitives.tsx";

interface ViewToggles {
  viewingInProgress: boolean;
  viewingVisionBoard: boolean;
  viewingTrash: boolean;
  sharedOpen: boolean;
  isSharedMode: boolean;
  inProgressCount: number;
  trashedCount: number;
  onGoVaultHome: () => void;
  onToggleInProgress: () => void;
  onToggleVisionBoard: () => void;
  onToggleTrash: () => void;
  onToggleShared: () => void;
}

/** Top bar: brand, home, search, In Progress, Vision Board, trash, Shared toggle, avatar. */
export function VaultTopBar({
  user,
  search,
  profileOpen,
  onSearchChange,
  onToggleProfile,
  viewingInProgress,
  viewingVisionBoard,
  viewingTrash,
  sharedOpen,
  isSharedMode,
  inProgressCount,
  trashedCount,
  onGoVaultHome,
  onToggleInProgress,
  onToggleVisionBoard,
  onToggleTrash,
  onToggleShared,
}: ViewToggles & {
  user: User | null;
  search: string;
  profileOpen: boolean;
  onSearchChange: (val: string) => void;
  onToggleProfile: () => void;
}) {
  return (
    <header className="bs-top">
      <button type="button" className="bs-brand" onClick={onGoVaultHome}>
        BeatStackz
      </button>
      <div className="bs-mid">
        <button type="button" className="bs-rb" aria-label="Vault home" onClick={onGoVaultHome}>
          <StudioIcon name="home" className="bs-icon" />
        </button>
        <label className="bs-search">
          <StudioIcon name="search" className="bs-icon" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search..."
            aria-label="Search this vault"
            autoComplete="off"
          />
        </label>
      </div>
      <div className="bs-tools">
        <button
          type="button"
          className="bs-tb"
          aria-pressed={viewingInProgress}
          onClick={onToggleInProgress}
        >
          In Progress
          {inProgressCount > 0 && <span className="bs-count">{inProgressCount}</span>}
        </button>
        <button
          type="button"
          className="bs-tb"
          aria-pressed={viewingVisionBoard}
          onClick={onToggleVisionBoard}
        >
          Vision Board
        </button>
        <button
          type="button"
          className="bs-rb"
          aria-label={`Trash, ${trashedCount} ${trashedCount === 1 ? "item" : "items"}`}
          aria-pressed={viewingTrash}
          onClick={onToggleTrash}
        >
          <StudioIcon name="trash" className="bs-icon" />
        </button>
        <button
          type="button"
          className="bs-rb"
          aria-label="Shared"
          aria-pressed={sharedOpen}
          onClick={onToggleShared}
        >
          <StudioIcon name="users" className="bs-icon" />
          {isSharedMode && <span className="bs-dot" />}
        </button>
      </div>
      <button
        type="button"
        className="bs-avatar-btn"
        aria-label="Profile, theme and sign out"
        aria-expanded={profileOpen}
        onClick={onToggleProfile}
      >
        <UserAvatarBadge byName={user?.name ?? user?.email ?? "Swish"} sizeClass="w-7 h-7 text-xs" />
      </button>
    </header>
  );
}

const LOOKS: [VaultLook, string][] = [
  ["night", "Night"],
  ["paper", "Paper"],
];

/** Opens from the avatar: who is signed in, the Night / Paper switch, sign out. */
export function ProfileMenu({
  user,
  look,
  onChangeLook,
  onSignOut,
  onClose,
}: {
  user: User | null;
  look: VaultLook;
  onChangeLook: (look: VaultLook) => void;
  onSignOut: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="bs-scrim" onClick={onClose} />
      <div className="bs-pop bs-pop-top" role="dialog" aria-label="Profile">
        <div className="bs-li">
          <span className="bs-tx">
            <b>{user?.name ?? "Signed in"}</b>
            <small>{user?.email}</small>
          </span>
        </div>
        <span className="bs-label">Theme</span>
        <div className="bs-pills" role="group" aria-label="Theme" style={{ padding: "0 8px 6px" }}>
          {LOOKS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="bs-pill"
              aria-pressed={look === key}
              onClick={() => onChangeLook(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="bs-li" onClick={onSignOut}>
          <StudioIcon name="sign-out" className="bs-icon" />
          <span className="bs-tx">
            <b>Sign out</b>
          </span>
        </button>
      </div>
    </>
  );
}

/** Phone only: the six-item dock along the bottom. */
export function MobileDock({
  viewingInProgress,
  viewingVisionBoard,
  viewingTrash,
  sharedOpen,
  isSharedMode,
  inProgressCount,
  trashedCount,
  onGoVaultHome,
  onToggleInProgress,
  onToggleVisionBoard,
  onToggleTrash,
  onToggleShared,
  onOpenPlusMenu,
}: ViewToggles & { onOpenPlusMenu: () => void }) {
  return (
    <nav className="bs-dock" aria-label="Mobile Navigation Dock">
      <button
        type="button"
        aria-pressed={!viewingInProgress && !viewingVisionBoard && !viewingTrash}
        onClick={onGoVaultHome}
      >
        <StudioIcon name="vault" className="bs-icon" />
        Vault
      </button>
      <button type="button" aria-pressed={viewingInProgress} onClick={onToggleInProgress}>
        <StudioIcon name="progress" className="bs-icon" />
        In Prog{inProgressCount > 0 ? ` ${inProgressCount}` : ""}
      </button>
      <button type="button" aria-pressed={sharedOpen} onClick={onToggleShared}>
        <StudioIcon name="users" className="bs-icon" />
        Shared
        {isSharedMode && <span className="bs-dot" />}
      </button>
      <button type="button" className="bs-add" aria-label="Upload or create" onClick={onOpenPlusMenu}>
        <StudioIcon name="plus" className="bs-icon" />
      </button>
      <button type="button" aria-pressed={viewingVisionBoard} onClick={onToggleVisionBoard}>
        <StudioIcon name="board" className="bs-icon" />
        Board
      </button>
      <button type="button" aria-pressed={viewingTrash} onClick={onToggleTrash}>
        <StudioIcon name="trash" className="bs-icon" />
        Trash{trashedCount > 0 ? ` ${trashedCount}` : ""}
      </button>
    </nav>
  );
}
