import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileItem, Folder, Share, User, Vault, VaultMember } from "@bpackz/shared";
import { api, BpackzApiError } from "./api/client.ts";
import { BottomTransportPlayer } from "./components/BottomTransportPlayer.tsx";
import {
  StudioFileCard,
  StudioFileSection,
  TrashSection,
  type FileLayoutMode,
} from "./components/StudioFileSection.tsx";
import { HardwareGridSection, StudioIcon } from "./components/StudioPrimitives.tsx";
import { VaultHeader } from "./components/VaultHeader.tsx";
import {
  AuthModal,
  CollaboratorsModal,
  CreateFolderModal,
  CreateSharedVaultModal,
  PlusActionMenu,
  ShareContextSheet,
} from "./components/VaultModals.tsx";
import { UserAvatarBadge } from "./HardwareIcons.tsx";
import {
  computeDeterministicSha256,
  formatBytes,
  parseStudioFileDisplay,
} from "./utils/format.ts";
import {
  describeFileMeta,
  generateRandomSharedPalette,
  getOrCreateSharedVaultPalette,
  loadPersistedUiMeta,
  resolveFileOwnerName,
  resolveFolderUiMeta,
  savePersistedUiMeta,
  SWISH_BLACK_RED_PALETTE,
  TODO_MONOCHROME_PALETTE,
  WAVEFORM_BARS,
  type HardwareThemeSlot,
  type PersistedUiMeta,
  type TrashedFileEntry,
} from "./vaultTheme.ts";

export { formatBytes, parseStudioFileDisplay };

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("swish@bpackz.studio");
  const [authPassword, setAuthPassword] = useState("password1234");
  const [authError, setAuthError] = useState<string | null>(null);

  const [vaults, setVaults] = useState<Vault[]>([]);
  const [activeVaultId, setActiveVaultId] = useState<string | null>(null);
  const [rootFolders, setRootFolders] = useState<Folder[]>([]);
  const [subfoldersByRoot, setSubfoldersByRoot] = useState<Record<string, Folder[]>>({});
  const [filesByFolder, setFilesByFolder] = useState<Record<string, FileItem[]>>({});
  const [vaultMembers, setVaultMembers] = useState<VaultMember[]>([]);

  const [rootId, setRootId] = useState<string | null>(null);
  const [subId, setSubId] = useState<string | null>(null);
  const [forceFilesView, setForceFilesView] = useState(false);
  const [viewingTrash, setViewingTrash] = useState(false);
  const [search, setSearch] = useState("");
  const [trackFilter, setTrackFilter] = useState<"all" | "swish" | "todo">("all");
  const [fileLayout, setFileLayout] = useState<FileLayoutMode>("cards");
  const [animateSpawn, setAnimateSpawn] = useState(true);

  const [uiMeta, setUiMeta] = useState<PersistedUiMeta>(() => loadPersistedUiMeta());
  const [sharedDropdownOpen, setSharedDropdownOpen] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDesc, setNewFolderDesc] = useState("");
  const [newFolderColorIdx, setNewFolderColorIdx] = useState(0);
  const [newFolderIconKey, setNewFolderIconKey] = useState<string>("beats");

  const [creatingSharedVault, setCreatingSharedVault] = useState(false);
  const [newSharedVaultName, setNewSharedVaultName] = useState("");
  const [managingMembers, setManagingMembers] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");

  const [activePopoverFile, setActivePopoverFile] = useState<FileItem | null>(null);
  const [activeFileShares, setActiveFileShares] = useState<Share[]>([]);
  const [shareLinkExpiry, setShareLinkExpiry] = useState<"24h" | "7d" | "30d">("7d");

  const [playingFile, setPlayingFile] = useState<FileItem | null>(null);
  const [waveformBars, setWaveformBars] = useState<number[]>(WAVEFORM_BARS);
  const [playProgress, setPlayProgress] = useState(38);
  const [loopEnabled, setLoopEnabled] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Lock page display font to #5: Panchang Wide + Satoshi, and file card font to Studio Mono
  useEffect(() => {
    document.documentElement.setAttribute("data-font-pair", "panchang");
    document.body.setAttribute("data-font-pair", "panchang");
    document.body.setAttribute("data-file-font", "mono");
  }, []);

  const loadVaultContents = useCallback(
    async (vaultId: string) => {
      try {
        const rootListing = await api.files.listChildren(vaultId);
        const meta = loadPersistedUiMeta();
        const sortByOrder = (list: Folder[]) =>
          [...list].sort(
            (a, b) =>
              resolveFolderUiMeta(a, meta.folderMeta, 0).order -
              resolveFolderUiMeta(b, meta.folderMeta, 0).order,
          );

        const sortedRoots = sortByOrder(rootListing.folders);
        setRootFolders(sortedRoots);

        const nextSubs: Record<string, Folder[]> = {};
        const nextFiles: Record<string, FileItem[]> = { root: rootListing.files };

        await Promise.all(
          sortedRoots.map(async (rf) => {
            const childListing = await api.files.listChildren(vaultId, { folderId: rf.id });
            const sortedSubs = sortByOrder(childListing.folders);
            nextSubs[rf.id] = sortedSubs;
            nextFiles[rf.id] = childListing.files;

            await Promise.all(
              sortedSubs.map(async (sf) => {
                const subListing = await api.files.listChildren(vaultId, { folderId: sf.id });
                nextFiles[sf.id] = subListing.files;
              }),
            );
          }),
        );

        setSubfoldersByRoot(nextSubs);
        setFilesByFolder(nextFiles);
      } catch (err) {
        if (err instanceof BpackzApiError) showToast(err.message);
      }
    },
    [showToast],
  );

  const bootstrapSession = useCallback(
    async (preferredMode?: "personal" | "shared") => {
      setAuthLoading(true);
      try {
        const { user: me } = await api.auth.me();
        setUser(me);
        const { items: myVaults } = await api.vaults.list();
        setVaults(myVaults);

        const nextMeta = loadPersistedUiMeta();
        let metaChanged = false;
        for (const v of myVaults) {
          if (v.kind === "shared" && !nextMeta.sharedVaultPalettes[v.id]) {
            nextMeta.sharedVaultPalettes[v.id] = generateRandomSharedPalette();
            metaChanged = true;
          }
        }
        if (metaChanged) {
          savePersistedUiMeta(nextMeta);
          setUiMeta(nextMeta);
        }

        const personal = myVaults.find((v) => v.kind === "personal") ?? myVaults[0] ?? null;
        const shared = myVaults.find((v) => v.kind === "shared") ?? personal;
        const chosen = preferredMode === "shared" ? shared : personal;

        if (chosen) {
          setActiveVaultId(chosen.id);
          await loadVaultContents(chosen.id);
          if (chosen.kind === "shared") {
            const m = await api.vaults.members(chosen.id);
            setVaultMembers(m.items);
          }
        }
      } catch {
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    },
    [loadVaultContents],
  );

  useEffect(() => {
    void bootstrapSession("personal");
  }, [bootstrapSession]);

  const activeVault = useMemo(
    () => vaults.find((v) => v.id === activeVaultId) ?? vaults[0] ?? null,
    [vaults, activeVaultId],
  );

  const isSharedMode = activeVault?.kind === "shared";

  const currentUserKey: "swish" | "todo" = useMemo(() => {
    if (!user) return "swish";
    return (user.name ?? "").toLowerCase().includes("todo") ||
      user.email.toLowerCase().includes("todo")
      ? "todo"
      : "swish";
  }, [user]);

  const otherUserName = currentUserKey === "swish" ? "Todo" : "Swish";

  const activePalette: HardwareThemeSlot[] = useMemo(() => {
    if (activeVault?.kind === "shared") {
      return getOrCreateSharedVaultPalette(activeVault.id, uiMeta);
    }
    return currentUserKey === "todo" ? TODO_MONOCHROME_PALETTE : SWISH_BLACK_RED_PALETTE;
  }, [activeVault, currentUserKey, uiMeta]);

  const currentRootFolder = useMemo(
    () => rootFolders.find((f) => f.id === rootId) ?? null,
    [rootFolders, rootId],
  );

  const currentSubfolders = useMemo(
    () => (currentRootFolder ? subfoldersByRoot[currentRootFolder.id] ?? [] : []),
    [currentRootFolder, subfoldersByRoot],
  );

  const currentSubFolder = useMemo(
    () => currentSubfolders.find((sf) => sf.id === subId) ?? null,
    [currentSubfolders, subId],
  );

  const viewingFiles = Boolean(
    forceFilesView ||
      (currentRootFolder && currentSubfolders.length === 0) ||
      (currentRootFolder && currentSubFolder),
  );

  const activeFolderId = currentSubFolder?.id ?? currentRootFolder?.id ?? null;

  const activeFolderFiles = useMemo(
    () => (activeFolderId ? filesByFolder[activeFolderId] ?? [] : []),
    [activeFolderId, filesByFolder],
  );

  const query = search.trim().toLowerCase();

  const visibleRoots = useMemo(
    () =>
      rootFolders.filter((f, idx) => {
        if (!query) return true;
        const meta = resolveFolderUiMeta(f, uiMeta.folderMeta, idx);
        const subs = subfoldersByRoot[f.id] ?? [];
        return (
          f.name.toLowerCase().includes(query) ||
          meta.by.toLowerCase().includes(query) ||
          subs.some((sf) => sf.name.toLowerCase().includes(query))
        );
      }),
    [rootFolders, query, uiMeta.folderMeta, subfoldersByRoot],
  );

  const visibleSubs = useMemo(
    () =>
      currentSubfolders.filter((sf, idx) => {
        if (!query) return true;
        const meta = resolveFolderUiMeta(sf, uiMeta.folderMeta, idx);
        return sf.name.toLowerCase().includes(query) || meta.by.toLowerCase().includes(query);
      }),
    [currentSubfolders, query, uiMeta.folderMeta],
  );

  const globalMatchingFiles = useMemo(() => {
    if (!query || viewingFiles) return [];
    const out: FileItem[] = [];
    for (const list of Object.values(filesByFolder)) {
      for (const file of list) {
        const metaStr = describeFileMeta(file).toLowerCase();
        if (file.name.toLowerCase().includes(query) || metaStr.includes(query)) {
          out.push(file);
        }
      }
    }
    return out;
  }, [query, viewingFiles, filesByFolder]);

  const filteredFolderFiles = useMemo(
    () =>
      activeFolderFiles.filter((f) => {
        const matchesQuery =
          !query ||
          f.name.toLowerCase().includes(query) ||
          describeFileMeta(f).toLowerCase().includes(query);
        const owner = resolveFileOwnerName(f.createdBy).toLowerCase();
        const matchesChip = trackFilter === "all" || owner === trackFilter;
        return matchesQuery && matchesChip;
      }),
    [activeFolderFiles, query, trackFilter],
  );

  const trashedList: TrashedFileEntry[] = useMemo(
    () => (activeVaultId ? uiMeta.trashedByVault[activeVaultId] ?? [] : []),
    [activeVaultId, uiMeta.trashedByVault],
  );

  const canGoBack = Boolean(currentRootFolder || viewingTrash);

  const profileSubheading =
    isSharedMode && activeVault ? activeVault.name : user?.name ?? "Swish";

  const titleText = viewingTrash
    ? "Trash"
    : !currentRootFolder
      ? "The Vault"
      : currentSubFolder?.name ?? currentRootFolder.name;

  const subtitleText = useMemo(() => {
    if (viewingTrash) return `${profileSubheading} · 30-day recovery`;
    if (!currentRootFolder) return profileSubheading;
    const target = currentSubFolder ?? currentRootFolder;
    const meta = resolveFolderUiMeta(target, uiMeta.folderMeta, 0);
    return `${profileSubheading} · ${meta.by}`;
  }, [viewingTrash, profileSubheading, currentRootFolder, currentSubFolder, uiMeta.folderMeta]);

  const parentFolderTheme: HardwareThemeSlot = useMemo(() => {
    if (!currentRootFolder) return activePalette[0];
    const meta = resolveFolderUiMeta(currentRootFolder, uiMeta.folderMeta, 0);
    return activePalette[meta.colorSlot % activePalette.length] ?? activePalette[0];
  }, [currentRootFolder, activePalette, uiMeta.folderMeta]);

  const folderHasPlayingTrack = useCallback(
    (folder: Folder) => {
      if (!playingFile) return false;
      if ((filesByFolder[folder.id] ?? []).some((f) => f.id === playingFile.id)) return true;
      const subs = subfoldersByRoot[folder.id] ?? [];
      return subs.some((sf) => (filesByFolder[sf.id] ?? []).some((f) => f.id === playingFile.id));
    },
    [playingFile, filesByFolder, subfoldersByRoot],
  );

  const resetNavigation = (spawn = true) => {
    setRootId(null);
    setSubId(null);
    setForceFilesView(false);
    setViewingTrash(false);
    setCreatingFolder(false);
    setSharedDropdownOpen(false);
    setPlusMenuOpen(false);
    setAnimateSpawn(spawn);
  };

  const handleSelectProfile = async (targetKey: "swish" | "todo") => {
    const email = targetKey === "todo" ? "todo@bpackz.studio" : "swish@bpackz.studio";
    try {
      await api.auth.signInEmail({ email, password: "password1234" });
      resetNavigation(true);
      await bootstrapSession("personal");
      showToast(
        targetKey === "todo"
          ? "Todo's Vault · White & Black Theme"
          : "Swish's Vault · Black & Red Theme",
      );
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    }
  };

  const handleSwitchSpecificSharedVault = async (vaultId: string) => {
    setActiveVaultId(vaultId);
    resetNavigation(true);
    setManagingMembers(false);
    await loadVaultContents(vaultId);
    const m = await api.vaults.members(vaultId);
    setVaultMembers(m.items);
    const found = vaults.find((v) => v.id === vaultId);
    if (found) showToast(`Shared Vault · ${found.name}`);
  };

  const handleBack = () => {
    if (viewingTrash) setViewingTrash(false);
    else if (forceFilesView) setForceFilesView(false);
    else if (subId) setSubId(null);
    else setRootId(null);
    setCreatingFolder(false);
    setPlusMenuOpen(false);
    setAnimateSpawn(true);
  };

  const handleOpenRoot = (id: string) => {
    setRootId(id);
    setSubId(null);
    setForceFilesView(false);
    setViewingTrash(false);
    setCreatingFolder(false);
    setPlusMenuOpen(false);
    setAnimateSpawn(true);
  };

  const handleOpenSub = (id: string) => {
    setSubId(id);
    setForceFilesView(false);
    setViewingTrash(false);
    setCreatingFolder(false);
    setPlusMenuOpen(false);
    setAnimateSpawn(true);
  };

  const handleConfirmCreateFolder = async () => {
    if (!activeVaultId || !newFolderName.trim()) return;
    const name = newFolderName.trim();
    const desc =
      newFolderDesc.trim() || (currentRootFolder ? "custom subfolder" : "custom 3d folder");

    try {
      const folder = await api.folders.create(activeVaultId, {
        name,
        parentId: currentRootFolder ? currentRootFolder.id : null,
      });

      const nextMeta: PersistedUiMeta = {
        ...uiMeta,
        folderMeta: {
          ...uiMeta.folderMeta,
          [folder.id]: {
            by: desc,
            colorSlot: newFolderColorIdx,
            iconKey: newFolderIconKey || "beats",
            order: 50 + Object.keys(uiMeta.folderMeta).length,
          },
        },
      };
      savePersistedUiMeta(nextMeta);
      setUiMeta(nextMeta);

      setCreatingFolder(false);
      setNewFolderName("");
      setNewFolderDesc("");
      setForceFilesView(false);
      setAnimateSpawn(true);
      await loadVaultContents(activeVaultId);
      showToast(
        currentRootFolder
          ? `Spawned subfolder "${name}" in ${currentRootFolder.name}`
          : `Spawned 3D icon "${name}"`,
      );
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    }
  };

  const handleConfirmCreateSharedVault = async () => {
    const sharedCount = vaults.filter((v) => v.kind === "shared").length;
    const name = newSharedVaultName.trim() || `Swish × Todo #${sharedCount + 1}`;
    try {
      const vault = await api.vaults.create({ name });
      const otherEmail =
        currentUserKey === "swish" ? "todo@bpackz.studio" : "swish@bpackz.studio";
      await api.vaults.invite(vault.id, { email: otherEmail, role: "editor" });

      const nextMeta: PersistedUiMeta = {
        ...uiMeta,
        sharedVaultPalettes: {
          ...uiMeta.sharedVaultPalettes,
          [vault.id]: generateRandomSharedPalette(),
        },
      };
      savePersistedUiMeta(nextMeta);
      setUiMeta(nextMeta);

      for (const rName of ["beats", "presets", "vocals", "songs", "media"]) {
        await api.folders.create(vault.id, { name: rName, parentId: null });
      }

      const { items: refreshedVaults } = await api.vaults.list();
      setVaults(refreshedVaults);
      setActiveVaultId(vault.id);
      setCreatingSharedVault(false);
      setNewSharedVaultName("");
      resetNavigation(true);
      await loadVaultContents(vault.id);
      const m = await api.vaults.members(vault.id);
      setVaultMembers(m.items);
      showToast(`Created "${name}" with its own saved random color scheme`);
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    }
  };

  const handleInviteMember = async () => {
    if (!activeVaultId || !inviteEmail.trim()) return;
    try {
      await api.vaults.invite(activeVaultId, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      const m = await api.vaults.members(activeVaultId);
      setVaultMembers(m.items);
      showToast(`Invited ${inviteEmail.trim()} as ${inviteRole}`);
      setInviteEmail("");
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    }
  };

  const runMultipartUpload = async (
    targetVaultId: string,
    targetFolderId: string | null,
    name: string,
    size: number,
    mime: string | null,
    payload?: Blob,
  ) => {
    const sha256 = computeDeterministicSha256(name, size);
    const init = await api.uploads.create(targetVaultId, {
      folderId: targetFolderId,
      name,
      size: Math.max(1, size),
      mime: mime || "audio/wav",
      sha256,
    });

    if (init.dedup) return init.file;

    const partNumbers = Array.from({ length: init.partCount }, (_, i) => i + 1);
    const signed = await api.uploads.sign(targetVaultId, init.uploadId, {
      key: init.key,
      partNumbers,
    });

    const completedParts: { partNumber: number; etag: string }[] = [];
    for (const p of signed.urls) {
      const putRes = await fetch(p.url, {
        method: "PUT",
        body: payload ?? new Uint8Array([0]),
      });
      const etag = putRes.headers.get("ETag") || `"etag-${p.partNumber}"`;
      completedParts.push({ partNumber: p.partNumber, etag });
    }

    return api.uploads.complete(targetVaultId, init.uploadId, {
      key: init.key,
      folderId: targetFolderId,
      name,
      mime: mime || "audio/wav",
      sha256,
      parts: completedParts,
    });
  };

  const handleUploadSelection = async (files: FileList | null) => {
    if (!activeVaultId) return;
    const targetFolderId = activeFolderId ?? rootFolders[0]?.id ?? null;

    try {
      if (files && files.length > 0) {
        for (const f of Array.from(files)) {
          await runMultipartUpload(
            activeVaultId,
            targetFolderId,
            f.name,
            f.size || 24_500_000,
            f.type || "audio/wav",
            f,
          );
        }
        await loadVaultContents(activeVaultId);
        showToast(`Uploaded ${files.length} master file${files.length > 1 ? "s" : ""}`);
      } else {
        const sampleName = `${currentUserKey}_take_${Math.floor(100 + Math.random() * 899)}.wav`;
        await runMultipartUpload(
          activeVaultId,
          targetFolderId,
          sampleName,
          38_400_000,
          "audio/wav",
        );
        await loadVaultContents(activeVaultId);
        showToast(`Uploaded "${sampleName}"`);
      }
      setPlusMenuOpen(false);
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    }
  };

  const handleTogglePlay = async (file: FileItem) => {
    if (!activeVaultId) return;
    if (playingFile?.id === file.id) {
      setPlayingFile(null);
      return;
    }
    setPlayingFile(file);
    setPlayProgress(38);
    try {
      const wf = await api.files.waveform(activeVaultId, file.id);
      if (wf.data.length > 0) {
        const normalized = wf.data
          .filter((_, idx) => idx % 2 === 1)
          .slice(0, 28)
          .map((v) => Math.max(24, Math.min(96, Math.round(Math.abs(v)))));
        if (normalized.length > 8) setWaveformBars(normalized);
      }
    } catch {
      setWaveformBars(WAVEFORM_BARS);
    }
  };

  const handleDownloadFile = async (file: FileItem) => {
    if (!activeVaultId) return;
    try {
      const { url } = await api.files.downloadUrl(activeVaultId, file.id, {
        disposition: "attachment",
      });
      showToast(`Presigned download ready · ${file.name} (${url.slice(0, 28)}...)`);
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    }
  };

  const handleShareToSharedVault = async (file: FileItem, targetSharedVaultId?: string) => {
    const sharedVault =
      vaults.find((v) => v.id === targetSharedVaultId) ??
      vaults.find((v) => v.kind === "shared");
    if (!sharedVault) {
      showToast("Create a Shared Vault first");
      return;
    }

    try {
      const sharedRoots = await api.files.listChildren(sharedVault.id);
      const currentFolderName =
        currentSubFolder?.name ?? currentRootFolder?.name ?? "beats";
      let destFolder =
        sharedRoots.folders.find(
          (f) => f.name.toLowerCase() === (currentRootFolder?.name ?? "beats").toLowerCase(),
        ) ?? sharedRoots.folders[0];

      if (!destFolder) {
        destFolder = await api.folders.create(sharedVault.id, {
          name: currentFolderName,
          parentId: null,
        });
      }

      await runMultipartUpload(
        sharedVault.id,
        destFolder.id,
        file.name,
        file.size,
        file.mime,
      );

      if (activeVaultId === sharedVault.id) await loadVaultContents(sharedVault.id);
      setActivePopoverFile(null);
      showToast(`Shared "${file.name}" to ${otherUserName} in ${sharedVault.name}`);
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    }
  };

  const handleOpenFilePopover = async (file: FileItem) => {
    setActivePopoverFile(file);
    setPlusMenuOpen(false);
    if (!activeVaultId) return;
    try {
      const { items } = await api.shares.list(activeVaultId, file.id);
      setActiveFileShares(items);
    } catch {
      setActiveFileShares([]);
    }
  };

  const handleCreatePublicShareLink = async () => {
    if (!activeVaultId || !activePopoverFile) return;
    const hours = shareLinkExpiry === "24h" ? 24 : shareLinkExpiry === "7d" ? 168 : 720;
    try {
      const share = await api.shares.create(activeVaultId, activePopoverFile.id, {
        role: "view",
        expiresInHours: hours,
      });
      const token = share.url ? share.url.split("/s/")[1] ?? share.id : share.id;
      const nextMeta: PersistedUiMeta = {
        ...uiMeta,
        shareLinkTokens: {
          ...uiMeta.shareLinkTokens,
          [activePopoverFile.id]: [
            ...(uiMeta.shareLinkTokens[activePopoverFile.id] ?? []),
            { id: share.id, token, expiry: shareLinkExpiry, fileId: activePopoverFile.id },
          ],
        },
      };
      savePersistedUiMeta(nextMeta);
      setUiMeta(nextMeta);
      const { items } = await api.shares.list(activeVaultId, activePopoverFile.id);
      setActiveFileShares(items);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard
          .writeText(`${window.location.origin}/s/${token}`)
          .catch(() => {});
      }
      showToast(`Copied public share link /s/${token}`);
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    }
  };

  const handleRevokeShareLink = async (shareId: string) => {
    if (!activeVaultId || !activePopoverFile) return;
    try {
      await api.shares.revoke(activeVaultId, activePopoverFile.id, shareId);
      const { items } = await api.shares.list(activeVaultId, activePopoverFile.id);
      setActiveFileShares(items);
      showToast("Revoked share link");
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    }
  };

  const handleSoftDeleteFile = async (file: FileItem) => {
    if (!activeVaultId) return;
    try {
      await api.files.trash(activeVaultId, file.id);
      const folderLabel = currentSubFolder?.name ?? currentRootFolder?.name ?? "beats";
      const nextMeta: PersistedUiMeta = {
        ...uiMeta,
        trashedByVault: {
          ...uiMeta.trashedByVault,
          [activeVaultId]: [
            { file, folderName: folderLabel, deletedAt: Date.now() },
            ...(uiMeta.trashedByVault[activeVaultId] ?? []),
          ],
        },
      };
      savePersistedUiMeta(nextMeta);
      setUiMeta(nextMeta);
      if (playingFile?.id === file.id) setPlayingFile(null);
      setActivePopoverFile(null);
      await loadVaultContents(activeVaultId);
      showToast(`Moved "${file.name}" to 30-day Trash`);
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    }
  };

  const handleRestoreFromTrash = async (entry: TrashedFileEntry) => {
    if (!activeVaultId) return;
    try {
      await runMultipartUpload(
        activeVaultId,
        entry.file.folderId,
        entry.file.name,
        entry.file.size,
        entry.file.mime,
      );
      const nextMeta: PersistedUiMeta = {
        ...uiMeta,
        trashedByVault: {
          ...uiMeta.trashedByVault,
          [activeVaultId]: (uiMeta.trashedByVault[activeVaultId] ?? []).filter(
            (e) => e.file.id !== entry.file.id,
          ),
        },
      };
      savePersistedUiMeta(nextMeta);
      setUiMeta(nextMeta);
      await loadVaultContents(activeVaultId);
      showToast(`Restored "${entry.file.name}"`);
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      if (authMode === "signin") {
        await api.auth.signInEmail({ email: authEmail.trim(), password: authPassword });
      } else {
        await api.auth.signUpEmail({
          name: authName.trim() || "Producer",
          email: authEmail.trim(),
          password: authPassword,
        });
      }
      setAuthModalOpen(false);
      await bootstrapSession("personal");
      showToast("Signed in to The Vault");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Authentication failed");
    }
  };

  const handleSignOut = async () => {
    await api.auth.signOut();
    setUser(null);
    setAuthModalOpen(true);
    showToast("Signed out");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void handleUploadSelection(e.target.files)}
      />

      <VaultHeader
        user={user}
        currentUserKey={currentUserKey}
        isSharedMode={isSharedMode}
        activeVault={activeVault}
        vaults={vaults}
        uiMeta={uiMeta}
        sharedDropdownOpen={sharedDropdownOpen}
        newSharedVaultName={newSharedVaultName}
        canGoBack={canGoBack}
        viewingTrash={viewingTrash}
        currentRootFolder={currentRootFolder}
        currentSubFolder={currentSubFolder}
        rootFolders={rootFolders}
        currentSubfolders={currentSubfolders}
        folderMetaMap={uiMeta.folderMeta}
        activePalette={activePalette}
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setAnimateSpawn(false);
        }}
        onBack={handleBack}
        onGoVaultHome={() => resetNavigation(true)}
        onOpenRoot={handleOpenRoot}
        onOpenSub={handleOpenSub}
        onToggleSharedDropdown={() => {
          setSharedDropdownOpen((v) => !v);
          setPlusMenuOpen(false);
        }}
        onSwitchSharedVault={(vId) => void handleSwitchSpecificSharedVault(vId)}
        onManageSharedVaultMembers={(vId) => {
          void handleSwitchSpecificSharedVault(vId).then(() => setManagingMembers(true));
        }}
        onChangeNewSharedVaultName={setNewSharedVaultName}
        onCreateSharedVault={() => void handleConfirmCreateSharedVault()}
        onSelectProfile={(key) => void handleSelectProfile(key)}
        onSignOut={() => void handleSignOut()}
        onOpenAuthModal={() => setAuthModalOpen(true)}
      />

      {toast && (
        <div
          className={`fixed left-4 right-4 sm:left-auto sm:right-6 ${
            playingFile ? "bottom-24" : "bottom-6"
          } z-50 px-4 py-2.5 rounded-full bg-[var(--ink)] text-[var(--bg)] mono-meta text-[11px] uppercase text-center sm:text-left shadow-xl`}
        >
          {toast}
        </div>
      )}

      <main
        className={`flex-1 px-4 sm:px-6 md:px-12 ${canGoBack ? "sm:pl-20" : ""} py-8 sm:py-10 ${
          playingFile ? "pb-28" : ""
        } max-w-6xl w-full mx-auto`}
      >
        {/* Hero Workspace Title Bar */}
        <div className="flex items-end justify-between gap-4 pb-6 border-b border-[var(--hair)] relative">
          <div className="flex items-center gap-3.5">
            {canGoBack && (
              <button
                type="button"
                onClick={handleBack}
                title="Back"
                className="icon-btn shrink-0 w-10 h-10"
              >
                <StudioIcon name="back" className="w-5 h-5" />
              </button>
            )}

            <div>
              <h1 className="display-heading text-5xl sm:text-7xl text-[var(--ink)]">
                {titleText}
              </h1>
              <div className="flex flex-wrap items-center gap-2.5 mt-2">
                {isSharedMode ? (
                  <button
                    type="button"
                    onClick={() => setManagingMembers(true)}
                    title="Collaborators & Shared Vaults"
                    className="inline-flex items-center -space-x-1.5 cursor-pointer hover:opacity-90"
                  >
                    <UserAvatarBadge
                      byName="Swish"
                      sizeClass="w-5 h-5 text-[9px] ring-2 ring-[#edeae4]"
                    />
                    <UserAvatarBadge
                      byName="Todo"
                      sizeClass="w-5 h-5 text-[9px] ring-2 ring-[#edeae4]"
                    />
                  </button>
                ) : (
                  <UserAvatarBadge
                    byName={user?.name ?? "Swish"}
                    sizeClass="w-5 h-5 text-[9px]"
                  />
                )}
                <p className="text-sm sm:text-base font-normal text-[var(--ink-soft)]">
                  {subtitleText}
                </p>
              </div>
            </div>
          </div>

          {/* Right Workspace Pure Icon Toolbar */}
          <div className="flex items-center gap-2 relative">
            {!viewingFiles && !viewingTrash && (
              <button
                type="button"
                onClick={() => {
                  setAnimateSpawn(false);
                  window.requestAnimationFrame(() => setAnimateSpawn(true));
                }}
                title="Replay 3D Icon Spawn Animation"
                className="icon-btn"
              >
                <StudioIcon name="replay" />
              </button>
            )}

            {currentRootFolder && !currentSubFolder && !viewingFiles && !viewingTrash && (
              <button
                type="button"
                onClick={() => setForceFilesView(true)}
                title="Open Tracklist"
                className="icon-btn"
              >
                <StudioIcon name="list" />
              </button>
            )}

            {isSharedMode && (
              <button
                type="button"
                onClick={() => setManagingMembers(true)}
                title="Collaborators & Shared Vaults"
                className="icon-btn"
              >
                <StudioIcon name="user-plus" />
              </button>
            )}

            {(trashedList.length > 0 || viewingTrash) && (
              <button
                type="button"
                onClick={() => setViewingTrash((v) => !v)}
                title={`30-Day Trash (${trashedList.length})`}
                className={`icon-btn relative ${viewingTrash ? "icon-btn-active" : ""}`}
              >
                <StudioIcon name="trash" />
                {trashedList.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--ink)] text-[var(--bg)] mono-meta text-[9px] flex items-center justify-center">
                    {trashedList.length}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => setPlusMenuOpen((o) => !o)}
              title="Add / Create..."
              className="icon-btn icon-btn-active"
            >
              <StudioIcon name="plus" />
            </button>

            {plusMenuOpen && (
              <PlusActionMenu
                hasRootFolder={Boolean(currentRootFolder)}
                viewingFiles={viewingFiles}
                onCreateFolder={() => {
                  setPlusMenuOpen(false);
                  setCreatingFolder(true);
                }}
                onUploadFile={() => fileInputRef.current?.click()}
                onCreateSharedVault={() => {
                  setPlusMenuOpen(false);
                  setCreatingSharedVault(true);
                }}
              />
            )}
          </div>
        </div>

        {/* Trash View */}
        {viewingTrash && (
          <TrashSection
            trashedList={trashedList}
            onRestore={(entry) => void handleRestoreFromTrash(entry)}
          />
        )}

        {/* LEVEL 1: Spawning 3D Studio Hardware Root Icons */}
        {!currentRootFolder && !viewingTrash && !authLoading && (
          <HardwareGridSection
            folders={visibleRoots}
            folderMetaMap={uiMeta.folderMeta}
            activePalette={activePalette}
            animateSpawn={animateSpawn}
            createLabel="new icon"
            isSharedMainPage={isSharedMode}
            folderHasPlayingTrack={folderHasPlayingTrack}
            onSelectFolder={handleOpenRoot}
            onCreateClick={() => setCreatingFolder(true)}
          />
        )}

        {/* LEVEL 2: Spawning 3D Subfolder Studio Hardware Icons */}
        {currentRootFolder && !viewingFiles && !viewingTrash && (
          <HardwareGridSection
            folders={visibleSubs}
            folderMetaMap={uiMeta.folderMeta}
            activePalette={activePalette}
            animateSpawn={animateSpawn}
            createLabel="new folder"
            folderHasPlayingTrack={folderHasPlayingTrack}
            onSelectFolder={handleOpenSub}
            onCreateClick={() => setCreatingFolder(true)}
          />
        )}

        {/* Global Search Results across Vault */}
        {globalMatchingFiles.length > 0 && !viewingTrash && (
          <section className="pt-2 pb-8 space-y-2.5">
            <div className="px-1 flex items-center justify-between">
              <span className="mono-meta text-[10px] uppercase text-[var(--ink-soft)]">
                {globalMatchingFiles.length} matching{" "}
                {globalMatchingFiles.length === 1 ? "file" : "files"} across vault
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {globalMatchingFiles.map((file, idx) => (
                <StudioFileCard
                  key={file.id}
                  file={file}
                  idx={idx}
                  isPlaying={playingFile?.id === file.id}
                  playProgress={playProgress}
                  parentFolderTheme={parentFolderTheme}
                  otherUserName={otherUserName}
                  onTogglePlay={(f) => void handleTogglePlay(f)}
                  onDownload={(f) => void handleDownloadFile(f)}
                  onOpenPopover={(f) => void handleOpenFilePopover(f)}
                />
              ))}
            </div>
          </section>
        )}

        {/* LEVEL 3: Separated Tactile Studio Track Cards + 1-Tap Subfolder Pills */}
        {viewingFiles && !viewingTrash && (
          <StudioFileSection
            currentRootFolder={currentRootFolder}
            currentSubFolder={currentSubFolder}
            currentSubfolders={currentSubfolders}
            forceFilesView={forceFilesView}
            filesByFolder={filesByFolder}
            activeFolderFiles={activeFolderFiles}
            filteredFolderFiles={filteredFolderFiles}
            trackFilter={trackFilter}
            fileLayout={fileLayout}
            playingFileId={playingFile?.id ?? null}
            playProgress={playProgress}
            parentFolderTheme={parentFolderTheme}
            otherUserName={otherUserName}
            onSelectAllInRoot={() => {
              setSubId(null);
              setForceFilesView(true);
            }}
            onSelectSubfolder={handleOpenSub}
            onOpenCreateSubfolder={() => setCreatingFolder(true)}
            onChangeTrackFilter={setTrackFilter}
            onChangeFileLayout={setFileLayout}
            onUploadClick={() => void handleUploadSelection(null)}
            onTogglePlay={(f) => void handleTogglePlay(f)}
            onDownload={(f) => void handleDownloadFile(f)}
            onOpenPopover={(f) => void handleOpenFilePopover(f)}
          />
        )}
      </main>

      {activePopoverFile && (
        <ShareContextSheet
          file={activePopoverFile}
          otherUserName={otherUserName}
          vaults={vaults}
          uiMeta={uiMeta}
          shareLinkExpiry={shareLinkExpiry}
          activeFileShares={activeFileShares}
          onClose={() => setActivePopoverFile(null)}
          onShareToSharedVault={(f, svId) => void handleShareToSharedVault(f, svId)}
          onChangeExpiry={setShareLinkExpiry}
          onCreatePublicShareLink={() => void handleCreatePublicShareLink()}
          onRevokeShareLink={(shareId) => void handleRevokeShareLink(shareId)}
          onDownload={(f) => void handleDownloadFile(f)}
          onSoftDelete={(f) => void handleSoftDeleteFile(f)}
        />
      )}

      {creatingFolder && (
        <CreateFolderModal
          currentRootFolder={currentRootFolder}
          newFolderName={newFolderName}
          newFolderDesc={newFolderDesc}
          newFolderIconKey={newFolderIconKey}
          newFolderColorIdx={newFolderColorIdx}
          activePalette={activePalette}
          onChangeName={setNewFolderName}
          onChangeDesc={setNewFolderDesc}
          onChangeIconKey={setNewFolderIconKey}
          onChangeColorIdx={setNewFolderColorIdx}
          onConfirm={() => void handleConfirmCreateFolder()}
          onClose={() => setCreatingFolder(false)}
        />
      )}

      {creatingSharedVault && (
        <CreateSharedVaultModal
          newSharedVaultName={newSharedVaultName}
          onChangeName={setNewSharedVaultName}
          onConfirm={() => void handleConfirmCreateSharedVault()}
          onClose={() => setCreatingSharedVault(false)}
        />
      )}

      {managingMembers && (
        <CollaboratorsModal
          vaults={vaults}
          activeVaultId={activeVaultId}
          uiMeta={uiMeta}
          vaultMembers={vaultMembers}
          inviteEmail={inviteEmail}
          inviteRole={inviteRole}
          onSwitchSharedVault={(vId) => void handleSwitchSpecificSharedVault(vId)}
          onOpenCreateSharedVault={() => {
            setManagingMembers(false);
            setCreatingSharedVault(true);
          }}
          onChangeInviteEmail={setInviteEmail}
          onChangeInviteRole={setInviteRole}
          onInviteMember={() => void handleInviteMember()}
          onClose={() => setManagingMembers(false)}
        />
      )}

      {authModalOpen && (
        <AuthModal
          user={user}
          authMode={authMode}
          authName={authName}
          authEmail={authEmail}
          authPassword={authPassword}
          authError={authError}
          onChangeMode={setAuthMode}
          onChangeName={setAuthName}
          onChangeEmail={setAuthEmail}
          onChangePassword={setAuthPassword}
          onSubmit={(e) => void handleAuthSubmit(e)}
          onClose={() => setAuthModalOpen(false)}
        />
      )}

      {playingFile && (
        <BottomTransportPlayer
          playingFile={playingFile}
          waveformBars={waveformBars}
          playProgress={playProgress}
          loopEnabled={loopEnabled}
          onToggleLoop={() => setLoopEnabled((v) => !v)}
          onSeek={setPlayProgress}
          onShare={(f) => void handleOpenFilePopover(f)}
          onDownload={(f) => void handleDownloadFile(f)}
          onClose={() => setPlayingFile(null)}
        />
      )}
    </div>
  );
}

export default App;
