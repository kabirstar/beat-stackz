import type { Vault, VaultMember } from "@bpackz/shared";
import { CoverTile, StudioIcon, UserAvatarBadge } from "./StudioPrimitives.tsx";

const ROLE_TEXT: Record<VaultMember["role"], string> = {
  owner: "owner · full access",
  editor: "editor · full edit & dl",
  viewer: "viewer · view only",
};

const memberName = (m: VaultMember) => m.name || m.email.split("@")[0] || "Member";
const vaultKind = (v: Vault) => (v.kind === "shared" ? "Shared vault" : "Personal vault");

/**
 * Right pane (a sheet on a phone): the open vault, its invite row and members, every vault you can
 * switch to, and "create shared vault". Replaces the collaborators modal and the vault dropdown.
 */
export function SharedPanel({
  activeVault,
  vaults,
  vaultMembers,
  inviteEmail,
  inviteRole,
  onChangeInviteEmail,
  onChangeInviteRole,
  onInviteMember,
  onRemoveMember,
  onRenameVault,
  onSwitchVault,
  onOpenCreateSharedVault,
  onClose,
}: {
  activeVault: Vault | null;
  vaults: Vault[];
  vaultMembers: VaultMember[];
  inviteEmail: string;
  inviteRole: "editor" | "viewer";
  onChangeInviteEmail: (v: string) => void;
  onChangeInviteRole: (v: "editor" | "viewer") => void;
  onInviteMember: () => void;
  onRemoveMember: (userId: string) => void;
  onRenameVault: (name: string) => void;
  onSwitchVault: (vaultId: string) => void;
  onOpenCreateSharedVault: () => void;
  onClose: () => void;
}) {
  const shared = activeVault?.kind === "shared";
  return (
    <aside className="bs-share" aria-label="Shared">
      <div className="bs-sh-h">
        <span>Shared</span>
        <button type="button" className="bs-ib" aria-label="Close Shared" onClick={onClose}>
          <StudioIcon name="close" className="bs-icon" />
        </button>
      </div>

      {activeVault && (
        <div className="bs-sh-card">
          <div className="bs-li">
            <CoverTile icon={shared ? "users" : "vault"} />
            <span className="bs-tx">
              <b>{activeVault.name}</b>
              <small>
                {shared
                  ? `Shared vault · ${vaultMembers.length} ${vaultMembers.length === 1 ? "person" : "people"}`
                  : "Personal vault · only you"}
              </small>
            </span>
            <span className="bs-badge">Open</span>
          </div>
          {shared ? (
            <>
              <form
                key={`${activeVault.id}:${activeVault.name}`}
                className="bs-inv"
                onSubmit={(e) => {
                  e.preventDefault();
                  const field = e.currentTarget.elements.namedItem("name");
                  onRenameVault((field as HTMLInputElement).value);
                }}
              >
                <input name="name" defaultValue={activeVault.name} aria-label="Vault name" />
                <button type="submit" className="bs-btn">
                  Rename
                </button>
              </form>
              <form
                className="bs-inv"
                onSubmit={(e) => {
                  e.preventDefault();
                  onInviteMember();
                }}
              >
                <input
                  className="bs-wide"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => onChangeInviteEmail(e.target.value)}
                  placeholder="Invite collaborator email..."
                  aria-label="Invite collaborator email"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => onChangeInviteRole(e.target.value as "editor" | "viewer")}
                  aria-label="Role"
                >
                  <option value="editor">Full Edit + DL</option>
                  <option value="viewer">View Only</option>
                </select>
                <button type="submit" className="bs-pb" aria-label="Send invite">
                  <StudioIcon name="send" className="bs-icon" />
                </button>
              </form>
            </>
          ) : (
            <>
              <span className="bs-sub">Work on files with your crew.</span>
              <button type="button" className="bs-btn" onClick={onOpenCreateSharedVault}>
                <StudioIcon name="plus" className="bs-icon" />
                New shared vault
              </button>
            </>
          )}
        </div>
      )}

      {shared && (
        <div className="bs-sh-sec">
          <span className="bs-label">Members</span>
          {vaultMembers.map((m) => (
            <div key={m.userId} className="bs-li">
              <UserAvatarBadge byName={memberName(m)} sizeClass="w-7 h-7 text-xs" />
              <span className="bs-tx">
                <b>{memberName(m)}</b>
                <small>{ROLE_TEXT[m.role]}</small>
              </span>
              {m.role !== "owner" && (
                <button
                  type="button"
                  className="bs-ib"
                  aria-label={`Remove ${memberName(m)}`}
                  onClick={() => onRemoveMember(m.userId)}
                >
                  <StudioIcon name="close" className="bs-icon" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="bs-sh-sec">
        <span className="bs-label">Your vaults</span>
        {vaults.map((v) => (
          <button
            key={v.id}
            type="button"
            className="bs-li"
            aria-current={v.id === activeVault?.id ? "true" : undefined}
            onClick={() => onSwitchVault(v.id)}
          >
            <CoverTile icon={v.kind === "shared" ? "users" : "vault"} />
            <span className="bs-tx">
              <b>{v.name}</b>
              <small>{vaultKind(v)}</small>
            </span>
          </button>
        ))}
        <button type="button" className="bs-li" onClick={onOpenCreateSharedVault}>
          <CoverTile icon="plus" />
          <span className="bs-tx">
            <b>Create new shared vault</b>
          </span>
        </button>
      </div>
    </aside>
  );
}
