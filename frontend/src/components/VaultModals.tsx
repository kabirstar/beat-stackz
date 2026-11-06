import { useState, type FormEvent } from "react";
import type { FileItem, Folder, Share, User, Vault } from "@bpackz/shared";
import { formatBytes, parseStudioFileDisplay } from "../utils/format.ts";
import {
  COVER_COLORS,
  describeFileMeta,
  ICON_TYPES,
  resolveFileOwnerName,
  type PersistedUiMeta,
} from "../vaultTheme.ts";
import {
  folderIconName,
  StudioIcon,
  StudioModal,
  UserAvatarBadge,
} from "./StudioPrimitives.tsx";

/** The "+" menu: new folder, upload, new shared vault. A sheet above the dock on a phone. */
export function PlusActionMenu({
  vaultName,
  hasRootFolder,
  onCreateFolder,
  onUploadFile,
  onCreateSharedVault,
  onClose,
}: {
  vaultName: string;
  hasRootFolder: boolean;
  onCreateFolder: () => void;
  onUploadFile: () => void;
  onCreateSharedVault: () => void;
  onClose: () => void;
}) {
  const items = [
    {
      icon: "plus" as const,
      title: hasRootFolder ? "New subfolder" : "New folder",
      subtitle: "Name it and pick an icon",
      onClick: onCreateFolder,
    },
    {
      icon: "upload" as const,
      title: "Upload track or stem",
      subtitle: "Any file, up to 10 GB",
      onClick: onUploadFile,
    },
    {
      icon: "user-plus" as const,
      title: "New shared vault",
      subtitle: "Invite your crew",
      onClick: onCreateSharedVault,
    },
  ];

  return (
    <>
      <div className="bs-scrim" onClick={onClose} />
      <div className="bs-pop" role="dialog" aria-label="Upload or create">
        <span className="bs-label">Add to {vaultName}</span>
        {items.map((item) => (
          <button key={item.title} type="button" className="bs-li" onClick={item.onClick}>
            <span className="bs-cv bs-cv-plain">
              <StudioIcon name={item.icon} className="" />
            </span>
            <span className="bs-tx">
              <b>{item.title}</b>
              <small>{item.subtitle}</small>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

const SHARE_ROW_BTN =
  "min-h-11 px-3 rounded-lg text-[10px] uppercase cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]";

/** One live share link with an in-page "Stop sharing" confirm step (TOD-103). Hook-free. */
export function ShareLinkRow({
  shareId,
  token,
  confirming,
  onOpen,
  onConfirming,
  onStop,
}: {
  shareId: string;
  /** Raw link token; only known in the browser that created the link. */
  token?: string;
  confirming: boolean;
  onOpen?: (token: string) => void;
  onConfirming: (shareId: string | null) => void;
  onStop: (shareId: string) => void;
}) {
  const label = `/s/${token ?? shareId}`;
  return (
    <li className="px-2.5 py-1.5 rounded-lg bg-[var(--card)] mono-meta text-[10px] space-y-1.5">
      <div className="truncate">{label}</div>
      {confirming ? (
        <div role="group" aria-label={`Stop sharing ${label}?`} className="space-y-1.5">
          <p className="text-[var(--ink)] normal-case">
            Stop sharing? This link will stop working for everyone who has it.
          </p>
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              autoFocus
              onClick={() => onConfirming(null)}
              className={`${SHARE_ROW_BTN} border border-[var(--hair)] text-[var(--ink)]`}
            >
              Keep link
            </button>
            <button
              type="button"
              onClick={() => onStop(shareId)}
              className={`${SHARE_ROW_BTN} bg-red-700 text-white`}
            >
              Yes, stop sharing
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-1.5">
          {token && onOpen && (
            <button
              type="button"
              onClick={() => onOpen(token)}
              aria-label={`Open public share view ${label}`}
              className={`${SHARE_ROW_BTN} bg-[var(--ink)] text-[var(--bg)]`}
            >
              Open
            </button>
          )}
          <button
            type="button"
            onClick={() => onConfirming(shareId)}
            aria-label={`Stop sharing ${label}`}
            className={`${SHARE_ROW_BTN} border border-[var(--error)] text-[var(--error)]`}
          >
            Stop sharing
          </button>
        </div>
      )}
    </li>
  );
}

export function ShareContextSheet({
  file,
  otherUserName,
  vaults,
  uiMeta,
  shareLinkExpiry,
  activeFileShares,
  onClose,
  onShareToSharedVault,
  onChangeExpiry,
  onCreatePublicShareLink,
  onRevokeShareLink,
  onPreviewShareToken,
  onRenameFile,
  onDownload,
  onSoftDelete,
}: {
  file: FileItem;
  otherUserName: string;
  vaults: Vault[];
  uiMeta: PersistedUiMeta;
  shareLinkExpiry: "24h" | "7d" | "30d";
  activeFileShares: Share[];
  onClose: () => void;
  onShareToSharedVault: (file: FileItem, sharedVaultId?: string) => void;
  onChangeExpiry: (exp: "24h" | "7d" | "30d") => void;
  onCreatePublicShareLink: () => void;
  onRevokeShareLink: (shareId: string) => void;
  onPreviewShareToken?: (token: string) => void;
  onRenameFile?: (file: FileItem, nextName: string) => void;
  onDownload: (file: FileItem) => void;
  onSoftDelete: (file: FileItem) => void;
}) {
  const [editingName, setEditingName] = useState(file.name);
  const [confirmingShareId, setConfirmingShareId] = useState<string | null>(null);

  return (
    <StudioModal maxWidthClass="max-w-sm" alignBottomOnMobile onClose={onClose}>
      <div className="p-4 bg-[var(--card)] border-b border-[var(--hair)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <UserAvatarBadge
            byName={resolveFileOwnerName(file.createdBy)}
            sizeClass="w-9 h-9 text-xs"
          />
          <div className="min-w-0">
            <div className="file-title-font text-xs text-[var(--ink)] truncate">{file.name}</div>
            <div className="mono-meta text-[10px] uppercase text-[var(--ink-soft)] truncate">
              {describeFileMeta(file)} · {formatBytes(file.size)}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="icon-btn w-7 h-7 text-xs shrink-0"
        >
          ×
        </button>
      </div>

      {/* Inline Rename Row (files.update) */}
      {onRenameFile && (
        <div className="px-4 py-2.5 border-b border-[var(--hair)] flex items-center gap-2">
          <input
            type="text"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            placeholder="Rename file..."
            aria-label="File name"
            className="flex-1 px-3 py-1.5 rounded-xl bg-[var(--card)] border border-[var(--hair)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)]"
          />
          <button
            type="button"
            disabled={!editingName.trim() || editingName.trim() === file.name}
            onClick={() => onRenameFile(file, editingName.trim())}
            className="px-2.5 py-1.5 rounded-xl bg-[var(--ink)] text-[var(--bg)] mono-meta text-[9px] uppercase cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      )}

      {/* AirDrop-Style Collaborator & Shared Vault Row */}
      <div className="px-4 py-3.5 border-b border-[var(--hair)]">
        <div className="mono-meta text-[9px] uppercase text-[var(--ink-soft)] mb-2.5">
          Send directly to
        </div>
        <div className="flex items-center gap-4 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => onShareToSharedVault(file)}
            className="flex flex-col items-center gap-1.5 group cursor-pointer shrink-0"
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold bg-[var(--ink)] text-[var(--bg)]"
            >
              {otherUserName[0]}
            </div>
            <span className="text-[11px] font-medium text-[var(--ink)]">{otherUserName}</span>
          </button>

          {vaults
            .filter((v) => v.kind === "shared")
            .map((sv) => (
              <button
                key={sv.id}
                type="button"
                onClick={() => onShareToSharedVault(file, sv.id)}
                className="flex flex-col items-center gap-1.5 cursor-pointer shrink-0"
              >
                <div className="w-12 h-12 rounded-[10px] flex items-center justify-center bg-[var(--card-deep)] text-[var(--ink)] border border-[var(--hair)]">
                  <StudioIcon name="users" className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-medium text-[var(--ink)] max-w-[72px] truncate">
                  {sv.name}
                </span>
              </button>
            ))}
        </div>
      </div>

      {/* Public Share Link (/s/tok_...) */}
      <div className="px-4 py-3 border-b border-[var(--hair)] space-y-2">
        <div className="flex items-center justify-between">
          <span className="mono-meta text-[9px] uppercase text-[var(--ink-soft)]">
            Public Share Link
          </span>
          <div className="inline-flex rounded-full bg-[var(--card)] p-0.5 border border-[var(--hair)]">
            {(["24h", "7d", "30d"] as const).map((exp) => (
              <button
                key={exp}
                type="button"
                onClick={() => onChangeExpiry(exp)}
                className={`px-2 py-0.5 rounded-full mono-meta text-[9px] uppercase cursor-pointer ${
                  shareLinkExpiry === exp
                    ? "bg-[var(--ink)] text-[var(--bg)]"
                    : "text-[var(--ink-soft)]"
                }`}
              >
                {exp}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onCreatePublicShareLink}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[var(--card)] hover:bg-[var(--card-deep)] text-xs text-[var(--ink)] cursor-pointer transition"
        >
          <span className="flex items-center gap-2.5 font-medium">
            <StudioIcon name="link" />
            Copy Share Link
          </span>
          <span className="mono-meta text-[10px] text-[var(--ink-soft)]">/s/tok_...</span>
        </button>

        {activeFileShares.length > 0 && (
          <ul aria-label="Active share links" className="space-y-1 pt-1">
            {activeFileShares.map((s) => {
              const tokEntry = (uiMeta.shareLinkTokens[file.id] ?? []).find(
                (t) => t.id === s.id,
              );
              return (
                <ShareLinkRow
                  key={s.id}
                  shareId={s.id}
                  token={tokEntry?.token}
                  confirming={confirmingShareId === s.id}
                  onOpen={onPreviewShareToken}
                  onConfirming={setConfirmingShareId}
                  onStop={onRevokeShareLink}
                />
              );
            })}
          </ul>
        )}
      </div>

      {/* Context Actions */}
      <div className="p-2 space-y-0.5">
        <button
          type="button"
          onClick={() => {
            onDownload(file);
            onClose();
          }}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-[var(--card-deep)] text-xs text-[var(--ink)] cursor-pointer transition"
        >
          <span className="text-[var(--ink-soft)]">
            <StudioIcon name="download" />
          </span>
          <span>Download Master File</span>
        </button>

        <button
          type="button"
          onClick={() => onSoftDelete(file)}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-[var(--card-deep)] text-xs text-[var(--error)] cursor-pointer transition"
        >
          <StudioIcon name="trash" />
          <span>Move to Trash</span>
        </button>
      </div>
    </StudioModal>
  );
}

export function CreateFolderModal({
  currentRootFolder,
  newFolderName,
  newFolderDesc,
  newFolderIconKey,
  newFolderColorIdx,
  onChangeName,
  onChangeDesc,
  onChangeIconKey,
  onChangeColorIdx,
  onConfirm,
  onClose,
}: {
  currentRootFolder: Folder | null;
  newFolderName: string;
  newFolderDesc: string;
  newFolderIconKey: string;
  newFolderColorIdx: number;
  onChangeName: (v: string) => void;
  onChangeDesc: (v: string) => void;
  onChangeIconKey: (v: string) => void;
  onChangeColorIdx: (v: number) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <StudioModal
      title={
        currentRootFolder
          ? `New Subfolder in ${currentRootFolder.name}`
          : "New folder"
      }
      onClose={onClose}
    >
      <div className="p-5 space-y-3.5">
        <div>
          <label className="block mono-meta text-[10px] uppercase text-[var(--ink-soft)] mb-1">
            Title
          </label>
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => onChangeName(e.target.value)}
            placeholder={
              currentRootFolder
                ? "e.g. stems, masters, v2..."
                : "e.g. samples, contracts, synths..."
            }
            className="w-full px-3.5 py-2 rounded-xl bg-[var(--card)] border border-[var(--hair)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)]"
          />
        </div>
        <div>
          <label className="block mono-meta text-[10px] uppercase text-[var(--ink-soft)] mb-1">
            Small description
          </label>
          <input
            type="text"
            value={newFolderDesc}
            onChange={(e) => onChangeDesc(e.target.value)}
            placeholder="e.g. drum kits & loops"
            className="w-full px-3.5 py-2 rounded-xl bg-[var(--card)] border border-[var(--hair)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)]"
          />
        </div>
        <div>
          <label className="block mono-meta text-[10px] uppercase text-[var(--ink-soft)] mb-1.5">
            Icon
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {ICON_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={newFolderIconKey === t.key}
                onClick={() => onChangeIconKey(t.key)}
                className={`min-h-11 px-2.5 py-1.5 rounded-[10px] mono-meta text-[10px] uppercase border cursor-pointer text-left inline-flex items-center gap-2 ${
                  newFolderIconKey === t.key
                    ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                    : "bg-[var(--card)] text-[var(--ink)] border-[var(--hair)] hover:border-[var(--ink)]"
                }`}
              >
                <StudioIcon name={folderIconName(t.key)} className="w-4 h-4 shrink-0" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-[var(--hair)]">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Cover colour">
            {COVER_COLORS.map((color, idx) => (
              <button
                key={color}
                type="button"
                aria-label={`Cover colour ${idx + 1}`}
                aria-pressed={newFolderColorIdx === idx}
                onClick={() => onChangeColorIdx(idx)}
                className={`w-11 h-11 sm:w-7 sm:h-7 rounded-[6px] cursor-pointer ${
                  newFolderColorIdx === idx ? "ring-2 ring-offset-2 ring-[var(--ink)]" : ""
                }`}
                style={{ background: color }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onConfirm}
            title="Create folder"
            aria-label="Create folder"
            className="icon-btn icon-btn-active w-10 h-10"
          >
            <StudioIcon name="check" />
          </button>
        </div>
      </div>
    </StudioModal>
  );
}

export function CreateSharedVaultModal({
  newSharedVaultName,
  onChangeName,
  onConfirm,
  onClose,
}: {
  newSharedVaultName: string;
  onChangeName: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <StudioModal title="New Shared Vault" maxWidthClass="max-w-sm" onClose={onClose}>
      <div className="p-5 space-y-4">
        <p className="text-xs text-[var(--ink-soft)]">
          A vault you and your crew both own. Invite people once it exists.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newSharedVaultName}
            onChange={(e) => onChangeName(e.target.value)}
            placeholder="e.g. Summer Tape (Swish × Todo)"
            aria-label="Shared vault name"
            className="flex-1 px-3.5 py-2 rounded-full bg-[var(--card)] border border-[var(--hair)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)]"
          />
          <button
            type="button"
            onClick={onConfirm}
            title="Create shared vault"
            aria-label="Create shared vault"
            className="icon-btn icon-btn-active"
          >
            <StudioIcon name="check" />
          </button>
        </div>
      </div>
    </StudioModal>
  );
}

export function AuthModal({
  user,
  authMode,
  authName,
  authEmail,
  authPassword,
  authError,
  onChangeMode,
  onChangeName,
  onChangeEmail,
  onChangePassword,
  onSubmit,
  onClose,
}: {
  user: User | null;
  authMode: "signin" | "signup";
  authName: string;
  authEmail: string;
  authPassword: string;
  authError: string | null;
  onChangeMode: (m: "signin" | "signup") => void;
  onChangeName: (v: string) => void;
  onChangeEmail: (v: string) => void;
  onChangePassword: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <StudioModal
      title={authMode === "signin" ? "Sign in to The Vault" : "Create Studio Account"}
      maxWidthClass="max-w-sm"
      onClose={user ? onClose : undefined}
    >
      <form onSubmit={onSubmit} autoComplete="off" className="p-5 space-y-3">
        {authMode === "signup" && (
          <input
            type="text"
            value={authName}
            onChange={(e) => onChangeName(e.target.value)}
            placeholder="Artist / Producer Name"
            autoComplete="off"
            className="w-full px-3.5 py-2 rounded-xl bg-[var(--card)] border border-[var(--hair)] text-xs text-[var(--ink)]"
          />
        )}
        <input
          type="email"
          value={authEmail}
          onChange={(e) => onChangeEmail(e.target.value)}
          placeholder="Email"
          autoComplete="off"
          className="w-full px-3.5 py-2 rounded-xl bg-[var(--card)] border border-[var(--hair)] text-xs text-[var(--ink)]"
        />
        <input
          type="password"
          value={authPassword}
          onChange={(e) => onChangePassword(e.target.value)}
          placeholder="Password"
          autoComplete="new-password"
          className="w-full px-3.5 py-2 rounded-xl bg-[var(--card)] border border-[var(--hair)] text-xs text-[var(--ink)]"
        />
        {authError && <p className="text-xs text-[var(--error)]">{authError}</p>}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => onChangeMode(authMode === "signin" ? "signup" : "signin")}
            className="text-xs text-[var(--ink-soft)] hover:text-[var(--ink)] cursor-pointer"
          >
            {authMode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-full bg-[var(--ink)] text-[var(--bg)] mono-meta text-[10px] uppercase cursor-pointer"
          >
            {authMode === "signin" ? "Sign In" : "Create"}
          </button>
        </div>
      </form>
    </StudioModal>
  );
}

export function PublicShareLandingModal({
  token,
  resolvedFile,
  resolvedRole,
  resolvedExpiresAt,
  error,
  waveformBars,
  isPlaying,
  playProgress,
  onTogglePlay,
  onDownload,
  onClose,
}: {
  token: string;
  resolvedFile: FileItem | null;
  resolvedRole: "view" | "edit" | null;
  resolvedExpiresAt: string | null;
  error: string | null;
  waveformBars: number[];
  isPlaying: boolean;
  playProgress: number;
  onTogglePlay: () => void;
  onDownload: () => void;
  onClose: () => void;
}) {
  const parsed = resolvedFile ? parseStudioFileDisplay(resolvedFile.name) : null;
  return (
    <StudioModal title={`Public Share · /s/${token.slice(0, 12)}…`} onClose={onClose}>
      <div className="p-5 space-y-4">
        {error ? (
          <div className="p-4 rounded-2xl border border-[var(--error)] text-xs text-[var(--error)]">
            {error}
          </div>
        ) : !resolvedFile || !parsed ? (
          <div className="p-6 text-center mono-meta text-[11px] uppercase text-[var(--ink-soft)]">
            Resolving share token…
          </div>
        ) : (
          <>
            <div className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--hair)] space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="file-title-font text-base text-[var(--ink)] truncate">
                    {parsed.cleanTitle}
                  </div>
                  <div className="mono-meta text-[10px] uppercase text-[var(--ink-soft)] mt-0.5">
                    {resolvedFile.name} · {formatBytes(resolvedFile.size)}
                  </div>
                </div>
                <span className="mono-meta text-[9px] uppercase px-2 py-1 rounded-md bg-[var(--ink)] text-[var(--bg)] shrink-0">
                  {parsed.ext} · {resolvedRole ?? "view"}
                </span>
              </div>

              {parsed.isAudio && (
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={onTogglePlay}
                    className="w-10 h-10 rounded-xl bg-[var(--ink)] text-[var(--bg)] flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <StudioIcon name={isPlaying ? "pause" : "play"} className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex-1 flex items-center gap-0.5 h-8 px-2.5 py-1 rounded-xl bg-[var(--bg)] border border-[var(--hair)]">
                    {waveformBars.map((h, i) => {
                      const active = isPlaying && (i / waveformBars.length) * 100 <= playProgress;
                      return (
                        <span
                          key={i}
                          className="flex-1 rounded-full"
                          style={{
                            height: `${Math.max(4, Math.round(h * 0.22))}px`,
                            background: active ? "var(--ink)" : "color-mix(in srgb, var(--ink) 25%, transparent)",
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {resolvedExpiresAt && (
                <div className="mono-meta text-[9px] uppercase text-[var(--ink-soft)]">
                  Expires {new Date(resolvedExpiresAt).toLocaleDateString()}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-full bg-[var(--card)] border border-[var(--hair)] mono-meta text-[10px] uppercase text-[var(--ink)] cursor-pointer"
              >
                Back to Vault
              </button>
              <button
                type="button"
                onClick={onDownload}
                className="px-4 py-2 rounded-full bg-[var(--ink)] text-[var(--bg)] mono-meta text-[10px] uppercase flex items-center gap-1.5 cursor-pointer"
              >
                <StudioIcon name="download" className="w-3.5 h-3.5" />
                <span>Download Master</span>
              </button>
            </div>
          </>
        )}
      </div>
    </StudioModal>
  );
}
