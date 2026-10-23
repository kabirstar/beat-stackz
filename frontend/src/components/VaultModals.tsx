import { useState, type FormEvent } from "react";
import type { FileItem, Folder, Share, User, Vault, VaultMember } from "@bpackz/shared";
import { UserAvatarBadge } from "../HardwareIcons.tsx";
import { formatBytes, parseStudioFileDisplay } from "../utils/format.ts";
import {
  describeFileMeta,
  getOrCreateSharedVaultPalette,
  ICON_TYPES,
  resolveFileOwnerName,
  type HardwareThemeSlot,
  type PersistedUiMeta,
} from "../vaultTheme.ts";
import { StudioIcon, StudioModal } from "./StudioPrimitives.tsx";

export function PlusActionMenu({
  hasRootFolder,
  viewingFiles,
  onCreateFolder,
  onUploadFile,
  onCreateSharedVault,
  onClose,
}: {
  hasRootFolder: boolean;
  viewingFiles: boolean;
  onCreateFolder: () => void;
  onUploadFile: () => void;
  onCreateSharedVault: () => void;
  onClose?: () => void;
}) {
  const items = [
    {
      icon: "folder-plus" as const,
      title: hasRootFolder ? "New 3D Subfolder" : "New 3D Main Icon",
      subtitle: "Custom 3D studio hardware",
      onClick: onCreateFolder,
      show: true,
    },
    {
      icon: "upload" as const,
      title: "Upload Track / Stem",
      subtitle: "Presigned S3 multipart upload",
      onClick: onUploadFile,
      show: hasRootFolder || viewingFiles,
    },
    {
      icon: "user-plus" as const,
      title: "New Shared Vault",
      subtitle: "Generates random color scheme",
      onClick: onCreateSharedVault,
      show: true,
    },
  ];

  return (
    <>
      {onClose && <div className="fixed inset-0 z-40" onClick={onClose} />}
      <div className="absolute right-0 top-12 z-50 w-60 rounded-2xl bg-[#e4e0d8]/95 backdrop-blur-xl border border-[var(--ink)]/20 shadow-2xl p-1.5 popover-sheet">
        {items
          .filter((item) => item.show)
          .map((item) => (
            <button
              key={item.title}
              type="button"
              onClick={item.onClick}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-black/5 text-left text-xs text-[var(--ink)] cursor-pointer transition"
            >
              <span className="w-7 h-7 rounded-full bg-[var(--bg)] border border-[var(--hair)] flex items-center justify-center shrink-0">
                <StudioIcon name={item.icon} className="w-3.5 h-3.5" />
              </span>
              <div>
                <div className="font-medium">{item.title}</div>
                <div className="text-[10px] text-[var(--ink-soft)]">{item.subtitle}</div>
              </div>
            </button>
          ))}
      </div>
    </>
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
        <button type="button" onClick={onClose} className="icon-btn w-7 h-7 text-xs shrink-0">
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
              className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold shadow-md group-hover:scale-105 transition"
              style={
                otherUserName === "Todo"
                  ? { background: "#111114", color: "#fafafa" }
                  : {
                      background: "#0b0a0c",
                      color: "#ef4444",
                      border: "2px solid #dc2626",
                    }
              }
            >
              {otherUserName[0]}
            </div>
            <span className="text-[11px] font-medium text-[var(--ink)]">{otherUserName}</span>
          </button>

          {vaults
            .filter((v) => v.kind === "shared")
            .map((sv) => {
              const svPalette = getOrCreateSharedVaultPalette(sv.id, uiMeta);
              return (
                <button
                  key={sv.id}
                  type="button"
                  onClick={() => onShareToSharedVault(file, sv.id)}
                  className="flex flex-col items-center gap-1.5 group cursor-pointer shrink-0"
                >
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md group-hover:scale-105 transition"
                    style={{
                      background: svPalette[0].chassisBg,
                      border: `2px solid ${svPalette[0].accentPrimary}`,
                      color: svPalette[0].accentPrimary,
                    }}
                  >
                    <StudioIcon name="users" className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-medium text-[var(--ink)] max-w-[72px] truncate">
                    {sv.name}
                  </span>
                </button>
              );
            })}
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
          <div className="space-y-1 pt-1">
            {activeFileShares.map((s) => {
              const tokEntry = (uiMeta.shareLinkTokens[file.id] ?? []).find(
                (t) => t.id === s.id,
              );
              const label = tokEntry ? `/s/${tokEntry.token}` : `/s/${s.id}`;
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--card)] mono-meta text-[10px]"
                >
                  <span className="truncate">{label}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {tokEntry && onPreviewShareToken && (
                      <button
                        type="button"
                        onClick={() => onPreviewShareToken(tokEntry.token)}
                        title="Open Public Share View (/s/:token)"
                        className="px-2 py-0.5 rounded-md bg-[var(--ink)] text-[var(--bg)] text-[9px] uppercase cursor-pointer"
                      >
                        Open
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRevokeShareLink(s.id)}
                      title="Revoke"
                      className="icon-btn w-6 h-6"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
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
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-black/5 text-xs text-[var(--ink)] cursor-pointer transition"
        >
          <span className="text-[var(--ink-soft)]">
            <StudioIcon name="download" />
          </span>
          <span>Download Master File</span>
        </button>

        <button
          type="button"
          onClick={() => onSoftDelete(file)}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-black/5 text-xs text-red-700 cursor-pointer transition"
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
  activePalette,
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
  activePalette: HardwareThemeSlot[];
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
          : "New Main Screen 3D Icon"
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
            3D Studio Hardware Icon
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {ICON_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => onChangeIconKey(t.key)}
                className={`px-2.5 py-1.5 rounded-xl mono-meta text-[10px] uppercase border cursor-pointer transition text-left ${
                  newFolderIconKey === t.key
                    ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                    : "bg-[var(--card)] text-[var(--ink)] border-[var(--hair)] hover:border-[var(--ink)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-[var(--hair)]">
          <div className="flex items-center gap-2">
            {activePalette.map((preset, idx) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => onChangeColorIdx(idx)}
                title={preset.name}
                className={`w-6 h-6 rounded-full cursor-pointer transition border border-black/25 ${
                  newFolderColorIdx === idx
                    ? "ring-2 ring-[var(--ink)] scale-110"
                    : "opacity-75 hover:opacity-100"
                }`}
                style={{ background: preset.accentPrimary }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onConfirm}
            title="Create 3D Folder"
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
          Generates and saves a unique random 3D hardware color scheme for this Shared Vault.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newSharedVaultName}
            onChange={(e) => onChangeName(e.target.value)}
            placeholder="e.g. Summer Tape (Swish × Todo)"
            className="flex-1 px-3.5 py-2 rounded-full bg-[var(--card)] border border-[var(--hair)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)]"
          />
          <button
            type="button"
            onClick={onConfirm}
            title="Create Shared Vault"
            className="icon-btn icon-btn-active"
          >
            <StudioIcon name="check" />
          </button>
        </div>
      </div>
    </StudioModal>
  );
}

export function CollaboratorsModal({
  vaults,
  activeVaultId,
  uiMeta,
  vaultMembers,
  inviteEmail,
  inviteRole,
  onSwitchSharedVault,
  onOpenCreateSharedVault,
  onChangeInviteEmail,
  onChangeInviteRole,
  onInviteMember,
  onRemoveMember,
  onRenameSharedVault,
  onClose,
}: {
  vaults: Vault[];
  activeVaultId: string | null;
  uiMeta: PersistedUiMeta;
  vaultMembers: VaultMember[];
  inviteEmail: string;
  inviteRole: "editor" | "viewer";
  onSwitchSharedVault: (vaultId: string) => void;
  onOpenCreateSharedVault: () => void;
  onChangeInviteEmail: (v: string) => void;
  onChangeInviteRole: (v: "editor" | "viewer") => void;
  onInviteMember: () => void;
  onRemoveMember?: (userId: string) => void;
  onRenameSharedVault?: (name: string) => void;
  onClose: () => void;
}) {
  const activeShared = vaults.find((v) => v.id === activeVaultId && v.kind === "shared");
  const [vaultNameDraft, setVaultNameDraft] = useState(activeShared?.name ?? "");

  return (
    <StudioModal title="Shared Vaults & Collaborators" onClose={onClose}>
      <div className="p-5 space-y-4">
        <div>
          <div className="mono-meta text-[9px] uppercase text-[var(--ink-soft)] mb-2">
            Active Shared Vault
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {vaults
              .filter((v) => v.kind === "shared")
              .map((sv) => {
                const pal = getOrCreateSharedVaultPalette(sv.id, uiMeta);
                return (
                  <button
                    key={sv.id}
                    type="button"
                    onClick={() => {
                      setVaultNameDraft(sv.name);
                      onSwitchSharedVault(sv.id);
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-2 cursor-pointer border transition ${
                      sv.id === activeVaultId
                        ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                        : "bg-[var(--card)] text-[var(--ink)] border-[var(--hair)]"
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: pal[0].accentPrimary }}
                    />
                    <span>{sv.name}</span>
                  </button>
                );
              })}
            <button
              type="button"
              onClick={onOpenCreateSharedVault}
              title="Create new Shared Vault"
              className="icon-btn w-8 h-8 text-sm"
            >
              +
            </button>
          </div>
          {activeShared && onRenameSharedVault && (
            <div className="flex items-center gap-2 mt-2.5">
              <input
                type="text"
                value={vaultNameDraft}
                onChange={(e) => setVaultNameDraft(e.target.value)}
                placeholder="Rename shared vault..."
                className="flex-1 px-3 py-1.5 rounded-full bg-[var(--card)] border border-[var(--hair)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)]"
              />
              <button
                type="button"
                disabled={!vaultNameDraft.trim() || vaultNameDraft.trim() === activeShared.name}
                onClick={() => onRenameSharedVault(vaultNameDraft.trim())}
                className="px-3 py-1.5 rounded-full bg-[var(--ink)] text-[var(--bg)] mono-meta text-[9px] uppercase cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Rename
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2 pt-2 border-t border-[var(--hair)]">
          <div className="mono-meta text-[9px] uppercase text-[var(--ink-soft)]">Members</div>
          {vaultMembers.map((m) => (
            <div
              key={m.userId}
              className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--card)] border border-[var(--hair)] text-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <UserAvatarBadge byName={m.name ?? m.email} sizeClass="w-6 h-6 text-[10px]" />
                <div className="truncate">
                  <span className="font-medium text-[var(--ink)]">{m.name ?? m.email}</span>
                  <span className="text-[var(--ink-soft)] ml-1.5">{m.email}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="mono-meta text-[9px] uppercase px-2 py-0.5 rounded-full bg-[var(--card-deep)] text-[var(--ink)]">
                  {m.role === "owner"
                    ? "owner · full access"
                    : m.role === "viewer"
                      ? "viewer · view only"
                      : "editor · full edit & dl"}
                </span>
                {m.role !== "owner" && onRemoveMember && (
                  <button
                    type="button"
                    onClick={() => onRemoveMember(m.userId)}
                    title={`Remove ${m.name ?? m.email}`}
                    className="icon-btn w-6 h-6 text-xs text-red-700"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-[var(--hair)]">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => onChangeInviteEmail(e.target.value)}
            placeholder="Invite collaborator email..."
            className="flex-1 px-3.5 py-2 rounded-full bg-[var(--card)] border border-[var(--hair)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)]"
          />
          <select
            value={inviteRole}
            onChange={(e) => onChangeInviteRole(e.target.value as "editor" | "viewer")}
            className="px-2.5 py-2 rounded-full bg-[var(--card)] border border-[var(--hair)] mono-meta text-[9px] uppercase text-[var(--ink)] shrink-0 cursor-pointer"
          >
            <option value="editor">Full Edit + DL</option>
            <option value="viewer">View Only</option>
          </select>
          <button
            type="button"
            onClick={onInviteMember}
            title="Add Collaborator"
            className="icon-btn icon-btn-active"
          >
            <StudioIcon name="send" />
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
        {authError && <p className="text-xs text-red-700">{authError}</p>}
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
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-800">
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
                  <div className="flex-1 flex items-center gap-0.5 h-8 px-2.5 py-1 rounded-xl bg-[#f4f1eb] border border-[var(--hair)]">
                    {waveformBars.map((h, i) => {
                      const active = isPlaying && (i / waveformBars.length) * 100 <= playProgress;
                      return (
                        <span
                          key={i}
                          className="flex-1 rounded-full"
                          style={{
                            height: `${Math.max(4, Math.round(h * 0.22))}px`,
                            background: active ? "var(--ink)" : "rgba(22,19,43,0.25)",
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
