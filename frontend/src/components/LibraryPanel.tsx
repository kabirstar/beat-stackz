import type { FileItem, Folder, User, Vault, VaultMember } from "@bpackz/shared";
import { parseStudioFileDisplay } from "../utils/format.ts";
import {
  resolveFileOwnerName,
  resolveFolderCover,
  resolveFolderUiMeta,
  type FolderUiMeta,
} from "../vaultTheme.ts";
import { countFiles } from "./StudioFileSection.tsx";
import { CoverTile, folderIconName, type StudioIconName } from "./StudioPrimitives.tsx";

export type LibraryPill = "folders" | "files" | "vaults";

export interface LibraryItem {
  /** Also the key kept in the last-opened list: "go:<folderId>", "play:<fileId>", "vault:<vaultId>". */
  key: string;
  action: "go" | "play" | "vault";
  id: string;
  /** For a subfolder, the root folder it sits in. */
  parentId: string | null;
  name: string;
  sub: string;
  icon: StudioIconName;
  color?: string;
}

const isSpecialRoot = (folder: Folder, folderMeta: Record<string, FolderUiMeta>) =>
  ["vision_board", "in_progress"].includes(resolveFolderUiMeta(folder, folderMeta).iconKey);

/** Files in a folder and everything under it. */
export function filesUnder(
  folder: Folder,
  subfoldersByRoot: Record<string, Folder[]>,
  filesByFolder: Record<string, FileItem[]>,
): number {
  return (
    (filesByFolder[folder.id] ?? []).length +
    (subfoldersByRoot[folder.id] ?? []).reduce(
      (n, sf) => n + filesUnder(sf, subfoldersByRoot, filesByFolder),
      0,
    )
  );
}

/**
 * Everything the left "Your Vault" list can show, ordered by last opened (`recents`, newest first).
 * With no pill: folders and vaults always, plus the subfolders and files opened before.
 */
export function buildLibraryItems({
  roots,
  subfoldersByRoot,
  filesByFolder,
  vaults,
  folderMeta,
  recents,
  pill,
  vaultMembers,
  user,
}: {
  roots: Folder[];
  subfoldersByRoot: Record<string, Folder[]>;
  filesByFolder: Record<string, FileItem[]>;
  vaults: Vault[];
  folderMeta: Record<string, FolderUiMeta>;
  recents: string[];
  pill: LibraryPill | null;
  vaultMembers?: VaultMember[];
  user?: User | null;
}): LibraryItem[] {
  const rootItems = roots.map((f): LibraryItem => {
    const cover = resolveFolderCover(f, folderMeta);
    return {
      key: `go:${f.id}`,
      action: "go",
      id: f.id,
      parentId: null,
      name: f.name,
      sub: isSpecialRoot(f, folderMeta)
        ? resolveFolderUiMeta(f, folderMeta).by
        : `Folder · ${countFiles(filesUnder(f, subfoldersByRoot, filesByFolder))}`,
      icon: folderIconName(cover.iconKey),
      color: cover.color,
    };
  });
  const subItems = roots
    .filter((root) => !isSpecialRoot(root, folderMeta))
    .flatMap((root) =>
      (subfoldersByRoot[root.id] ?? []).map((sf): LibraryItem => {
        const cover = resolveFolderCover(sf, folderMeta, root);
        return {
          key: `go:${sf.id}`,
          action: "go",
          id: sf.id,
          parentId: root.id,
          name: sf.name,
          sub: `Subfolder · ${root.name}`,
          icon: folderIconName(cover.iconKey),
          color: cover.color,
        };
      }),
    );
  const vaultItems = vaults.map(
    (v): LibraryItem => ({
      key: `vault:${v.id}`,
      action: "vault",
      id: v.id,
      parentId: null,
      name: v.name,
      sub: v.kind === "shared" ? "Shared vault" : "Personal vault",
      icon: v.kind === "shared" ? "users" : "vault",
    }),
  );
  const fileItems = Object.values(filesByFolder)
    .flat()
    .map((f): LibraryItem => {
      const { cleanTitle, ext, isAudio } = parseStudioFileDisplay(f.name);
      return {
        key: `play:${f.id}`,
        action: "play",
        id: f.id,
        parentId: null,
        name: cleanTitle,
        sub: `${ext} · ${resolveFileOwnerName(f.createdBy, vaultMembers, user)}`,
        icon: isAudio ? "songs" : "file",
      };
    });

  const list =
    pill === "folders"
      ? [...rootItems, ...subItems]
      : pill === "files"
        ? fileItems
        : pill === "vaults"
          ? vaultItems
          : [
              ...rootItems,
              ...vaultItems,
              ...[...subItems, ...fileItems].filter((x) => recents.includes(x.key)),
            ];
  const rank = (x: LibraryItem) => {
    const i = recents.indexOf(x.key);
    return i < 0 ? recents.length : i;
  };
  // Array.prototype.sort is stable, so never-opened items keep their natural order.
  return [...list].sort((a, b) => rank(a) - rank(b));
}

export function LibraryRow({
  item,
  current,
  onOpen,
}: {
  item: LibraryItem;
  current: boolean;
  onOpen: (item: LibraryItem) => void;
}) {
  return (
    <button
      type="button"
      className="bs-li"
      aria-current={current ? "true" : undefined}
      onClick={() => onOpen(item)}
    >
      <CoverTile icon={item.icon} color={item.color} />
      <span className="bs-tx">
        <b>{item.name}</b>
        <small>{item.sub}</small>
      </span>
    </button>
  );
}

const PILLS: [LibraryPill, string][] = [
  ["folders", "Folders"],
  ["files", "Files"],
  ["vaults", "Vaults"],
];

/** Left pane: "Your Vault", the + New button, three filter pills and the last-opened list. */
export function LibraryPanel({
  items,
  pill,
  currentKeys,
  onChangePill,
  onOpenItem,
  onOpenNewMenu,
}: {
  items: LibraryItem[];
  pill: LibraryPill | null;
  currentKeys: string[];
  onChangePill: (pill: LibraryPill | null) => void;
  onOpenItem: (item: LibraryItem) => void;
  onOpenNewMenu: () => void;
}) {
  return (
    <aside className="bs-lib" aria-label="Your vault">
      <div className="bs-lib-h">
        <span>Your Vault</span>
        <button type="button" className="bs-pill" onClick={onOpenNewMenu}>
          + New
        </button>
      </div>
      <div className="bs-pills" role="group" aria-label="Show">
        {PILLS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="bs-pill"
            aria-pressed={pill === key}
            onClick={() => onChangePill(pill === key ? null : key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="bs-lib-s">Last opened first</div>
      <div className="bs-lib-l">
        {items.map((item) => (
          <LibraryRow
            key={item.key}
            item={item}
            current={currentKeys.includes(item.key)}
            onOpen={onOpenItem}
          />
        ))}
      </div>
    </aside>
  );
}
