import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileItem, Folder, Share, User, Vault, VaultMember } from "@bpackz/shared";
import { api, BpackzApiError } from "./api/client.ts";
import { BottomTransportPlayer } from "./components/BottomTransportPlayer.tsx";
import type { LibraryPill } from "./components/LibraryPanel.tsx";
import type { FileLayoutMode } from "./components/StudioFileSection.tsx";
import { VaultWorkspace } from "./components/VaultWorkspace.tsx";
import { VaultGateScreen, VAULT_GATE_SESSION_KEY } from "./components/VaultGateScreen.tsx";
import {
  AuthModal,
  CreateFolderModal,
  CreateSharedVaultModal,
  PublicShareLandingModal,
  ShareContextSheet,
} from "./components/VaultModals.tsx";
import type {
  InProgressSongEcosystem,
  LastAutoRouteSummary,
} from "./components/InProgressSection.tsx";
import {
  computeBlobSha256,
  createSampleWavBlob,
  formatBytes,
  parseStudioFileDisplay,
  showUploadedFile,
} from "./utils/format.ts";
import {
  classifyFlStudioStem,
  extractSessionFilesFromZip,
  guessMimeFromFilename,
  IN_PROGRESS_BUCKETS,
  IN_PROGRESS_ROOT_FOLDER_NAME,
  inferSongTitleFromBatch,
  isInProgressBucketKey,
  isSupportedSessionFile,
  type InProgressBucketKey,
} from "./utils/inProgressAutoRouter.ts";
import {
  createDefaultVisionBoardState,
  loadPersistedUiMeta,
  persistUiMeta,
  resolveFolderUiMeta,
  savePersistedUiMeta,
  sortVaultFolders,
  touchRecent,
  WAVEFORM_BARS,
  type PersistedUiMeta,
  type TrashedFileEntry,
  type VaultLook,
  type VisionBoardVaultState,
} from "./vaultTheme.ts";

export { formatBytes, parseStudioFileDisplay };

export function App() {
  const [vaultGateUnlocked, setVaultGateUnlocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return (
      window.localStorage?.getItem(VAULT_GATE_SESSION_KEY) === "1" ||
      window.sessionStorage?.getItem(VAULT_GATE_SESSION_KEY) === "1"
    );
  });
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [vaults, setVaults] = useState<Vault[]>([]);
  const [activeVaultId, setActiveVaultId] = useState<string | null>(null);
  const [rootFolders, setRootFolders] = useState<Folder[]>([]);
  const [subfoldersByRoot, setSubfoldersByRoot] = useState<Record<string, Folder[]>>({});
  const [filesByFolder, setFilesByFolder] = useState<Record<string, FileItem[]>>({});
  const [vaultMembers, setVaultMembers] = useState<VaultMember[]>([]);

  const [rootId, setRootId] = useState<string | null>(null);
  const [subId, setSubId] = useState<string | null>(null);
  const [viewingTrash, setViewingTrash] = useState(false);
  const [visionBoardOpen, setVisionBoardOpen] = useState(false);
  const [inProgressOpen, setInProgressOpen] = useState(false);
  const [activeInProgressSongId, setActiveInProgressSongId] = useState<string | null>(null);
  const [activeInProgressBucket, setActiveInProgressBucket] = useState<"all" | InProgressBucketKey>("all");
  const [inProgressImporting, setInProgressImporting] = useState(false);
  const [inProgressStatusText, setInProgressStatusText] = useState<string | null>(null);
  const [lastRouteSummary, setLastRouteSummary] = useState<LastAutoRouteSummary | null>(null);
  const [search, setSearch] = useState("");
  const [whoFilter, setWhoFilter] = useState<string | null>(null);
  const [fileLayout, setFileLayout] = useState<FileLayoutMode>("cards");

  const [uiMeta, setUiMeta] = useState<PersistedUiMeta>(() => loadPersistedUiMeta());
  // The Shared panel starts open where it has room to dock beside the centre pane.
  const [sharedOpen, setSharedOpen] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 1120,
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const [libraryPill, setLibraryPill] = useState<LibraryPill | null>(null);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDesc, setNewFolderDesc] = useState("");
  const [newFolderColorIdx, setNewFolderColorIdx] = useState(0);
  const [newFolderIconKey, setNewFolderIconKey] = useState<string>("beats");

  const [creatingSharedVault, setCreatingSharedVault] = useState(false);
  const [newSharedVaultName, setNewSharedVaultName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");

  const [activePopoverFile, setActivePopoverFile] = useState<FileItem | null>(null);
  const [activeFileShares, setActiveFileShares] = useState<Share[]>([]);
  const [shareLinkExpiry, setShareLinkExpiry] = useState<"24h" | "7d" | "30d">("7d");

  const [publicShareToken, setPublicShareToken] = useState<string | null>(null);
  const [publicShareFile, setPublicShareFile] = useState<FileItem | null>(null);
  const [publicShareRole, setPublicShareRole] = useState<"view" | "edit" | null>(null);
  const [publicShareExpiresAt, setPublicShareExpiresAt] = useState<string | null>(null);
  const [publicShareError, setPublicShareError] = useState<string | null>(null);

  const [playingFile, setPlayingFile] = useState<FileItem | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [waveformBars, setWaveformBars] = useState<number[]>(WAVEFORM_BARS);
  const [playProgress, setPlayProgress] = useState(0);
  const [playDuration, setPlayDuration] = useState(0);
  const [loopEnabled, setLoopEnabled] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const uploadFolderRef = useRef<string | null>(null);

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

  const look = uiMeta.look ?? "night";
  useEffect(() => {
    document.documentElement.dataset.look = look;
  }, [look]);

  const loadVaultContents = useCallback(
    async (vaultId: string) => {
      try {
        const rootListing = await api.files.listChildren(vaultId);
        const meta = loadPersistedUiMeta();
        const sortByOrder = (list: Folder[]) => sortVaultFolders(list, meta.folderMeta);

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
                if (subListing.folders.length > 0) {
                  const sortedGrandSubs = sortByOrder(subListing.folders);
                  nextSubs[sf.id] = sortedGrandSubs;
                  await Promise.all(
                    sortedGrandSubs.map(async (gsf) => {
                      const grandListing = await api.files.listChildren(vaultId, {
                        folderId: gsf.id,
                      });
                      nextFiles[gsf.id] = grandListing.files;
                    }),
                  );
                }
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

        const personal = myVaults.find((v) => v.kind === "personal") ?? myVaults[0] ?? null;
        const shared = myVaults.find((v) => v.kind === "shared") ?? personal;
        const chosen = preferredMode === "shared" ? shared : personal;

        if (chosen) {
          setActiveVaultId(chosen.id);
          await loadVaultContents(chosen.id);
          try {
            const m = await api.vaults.members(chosen.id);
            setVaultMembers(m.items);
          } catch {
            setVaultMembers([]);
          }
        }
      } catch {
        setUser(null);
        setAuthModalOpen(true);
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

  const inProgressRootFolder = useMemo(
    () =>
      rootFolders.find((f, idx) => {
        const meta = resolveFolderUiMeta(f, uiMeta.folderMeta, idx);
        return (
          f.name.trim().toLowerCase() === IN_PROGRESS_ROOT_FOLDER_NAME ||
          meta.iconKey === "in_progress"
        );
      }) ?? null,
    [rootFolders, uiMeta.folderMeta],
  );

  const viewingInProgress = useMemo(() => {
    if (viewingTrash || visionBoardOpen) return false;
    if (inProgressOpen) return true;
    if (!currentRootFolder) return false;
    const meta = resolveFolderUiMeta(currentRootFolder, uiMeta.folderMeta, 0);
    return (
      currentRootFolder.name.trim().toLowerCase() === IN_PROGRESS_ROOT_FOLDER_NAME ||
      meta.iconKey === "in_progress"
    );
  }, [currentRootFolder, viewingTrash, visionBoardOpen, inProgressOpen, uiMeta.folderMeta]);

  const inProgressSongs: InProgressSongEcosystem[] = useMemo(() => {
    if (!inProgressRootFolder) return [];
    const songFolders = subfoldersByRoot[inProgressRootFolder.id] ?? [];
    return songFolders.map((songFolder) => {
      const grandSubs = subfoldersByRoot[songFolder.id] ?? [];
      const bucketFolders: Partial<Record<InProgressBucketKey, Folder>> = {};
      const filesByBucket: Record<InProgressBucketKey, FileItem[]> = {
        beat: [],
        main: [],
        bg: [],
        adlib: [],
        demo: [],
        mixed: [],
      };
      for (const gs of grandSubs) {
        const lower = gs.name.trim().toLowerCase();
        if (isInProgressBucketKey(lower)) {
          bucketFolders[lower] = gs;
          filesByBucket[lower] = filesByFolder[gs.id] ?? [];
        }
      }
      const unbucketedFiles = filesByFolder[songFolder.id] ?? [];
      const totalFiles =
        unbucketedFiles.length +
        IN_PROGRESS_BUCKETS.reduce((acc, b) => acc + (filesByBucket[b.key]?.length ?? 0), 0);
      return {
        songFolder,
        bucketFolders,
        filesByBucket,
        unbucketedFiles,
        totalFiles,
      };
    });
  }, [inProgressRootFolder, subfoldersByRoot, filesByFolder]);

  const viewingVisionBoard = useMemo(() => {
    if (viewingTrash) return false;
    if (visionBoardOpen) return true;
    if (inProgressOpen) return false;
    if (!currentRootFolder) return false;
    const meta = resolveFolderUiMeta(currentRootFolder, uiMeta.folderMeta, 0);
    return (
      currentRootFolder.name.trim().toLowerCase() === "vision board" ||
      meta.iconKey === "vision_board"
    );
  }, [currentRootFolder, viewingTrash, visionBoardOpen, inProgressOpen, uiMeta.folderMeta]);

  const allVaultFilesFlat = useMemo(() => {
    const out: FileItem[] = [];
    for (const list of Object.values(filesByFolder)) {
      for (const f of list) out.push(f);
    }
    return out;
  }, [filesByFolder]);

  const activeVisionBoardState: VisionBoardVaultState = useMemo(() => {
    const vKey = activeVaultId ?? "default";
    return uiMeta.visionBoards?.[vKey] ?? createDefaultVisionBoardState(allVaultFilesFlat);
  }, [activeVaultId, uiMeta.visionBoards, allVaultFilesFlat]);

  const handleUpdateVisionBoard = useCallback(
    (nextBoard: VisionBoardVaultState) => {
      const vKey = activeVaultId ?? "default";
      const nextMeta: PersistedUiMeta = {
        ...uiMeta,
        visionBoards: {
          ...uiMeta.visionBoards,
          [vKey]: nextBoard,
        },
      };
      savePersistedUiMeta(nextMeta);
      setUiMeta(nextMeta);
    },
    [activeVaultId, uiMeta],
  );

  const activeFolderId = currentSubFolder?.id ?? currentRootFolder?.id ?? null;

  const visibleRoots = useMemo(() => {
    const hasVisionFolder = rootFolders.some((f, idx) => {
      const meta = resolveFolderUiMeta(f, uiMeta.folderMeta, idx);
      return (
        f.name.trim().toLowerCase() === "vision board" ||
        meta.iconKey === "vision_board"
      );
    });
    const hasInProgressFolder = rootFolders.some((f, idx) => {
      const meta = resolveFolderUiMeta(f, uiMeta.folderMeta, idx);
      return (
        f.name.trim().toLowerCase() === IN_PROGRESS_ROOT_FOLDER_NAME ||
        meta.iconKey === "in_progress"
      );
    });
    const combinedRoots: Folder[] = [
      ...rootFolders,
      ...(hasVisionFolder
        ? []
        : [
            {
              id: "__vision_board__",
              vaultId: activeVaultId ?? "default",
              parentId: null,
              name: "vision board",
              kind: null,
              createdBy: user?.id ?? "u_artist",
              updatedAt: new Date(0).toISOString(),
            },
          ]),
      ...(hasInProgressFolder
        ? []
        : [
            {
              id: "__in_progress__",
              vaultId: activeVaultId ?? "default",
              parentId: null,
              name: IN_PROGRESS_ROOT_FOLDER_NAME,
              kind: null,
              createdBy: user?.id ?? "u_artist",
              updatedAt: new Date(0).toISOString(),
            },
          ]),
    ];

    return combinedRoots;
  }, [rootFolders, activeVaultId, user?.id, uiMeta.folderMeta]);

  // Poll processing files until verification worker (or mock timer) flips them to ready/failed
  useEffect(() => {
    if (!activeVaultId) return;
    const processingFiles: { folderKey: string; file: FileItem }[] = [];
    for (const [folderKey, list] of Object.entries(filesByFolder)) {
      for (const f of list) {
        if (f.status === "processing") {
          processingFiles.push({ folderKey, file: f });
        }
      }
    }
    if (processingFiles.length === 0) return;

    const timer = window.setInterval(() => {
      void (async () => {
        let changed = false;
        const updates = new Map<string, FileItem>();
        for (const { file } of processingFiles) {
          try {
            const latest = await api.files.get(activeVaultId, file.id);
            if (latest.status !== file.status) {
              changed = true;
              updates.set(file.id, latest);
            }
          } catch {
            // ignore transient poll error
          }
        }
        if (changed) {
          setFilesByFolder((prev) => {
            const next: Record<string, FileItem[]> = {};
            for (const [k, list] of Object.entries(prev)) {
              next[k] = list.map((item) => updates.get(item.id) ?? item);
            }
            return next;
          });
          for (const updated of updates.values()) {
            if (updated.status === "ready") {
              showToast(`Verified & ready · "${updated.name}"`);
            } else if (updated.status === "failed") {
              showToast(`Upload verification failed · "${updated.name}"`);
            }
          }
        }
      })();
    }, 1200);

    return () => window.clearInterval(timer);
  }, [activeVaultId, filesByFolder, showToast]);

  const trashedList: TrashedFileEntry[] = useMemo(
    () => (activeVaultId ? uiMeta.trashedByVault[activeVaultId] ?? [] : []),
    [activeVaultId, uiMeta.trashedByVault],
  );

  const resetNavigation = () => {
    // The Shared panel is a sheet over the page until it has room to dock.
    if (typeof window !== "undefined" && window.innerWidth < 1120) setSharedOpen(false);
    setRootId(null);
    setSubId(null);
    setViewingTrash(false);
    setVisionBoardOpen(false);
    setInProgressOpen(false);
    setCreatingFolder(false);
    setPlusMenuOpen(false);
  };

  const touchRecentKey = (key: string) =>
    setUiMeta((prev) => persistUiMeta({ ...prev, recents: touchRecent(prev.recents, key) }));

  const goVaultHome = () => {
    resetNavigation();
    setSearch("");
  };

  const handleSwitchVault = async (vaultId: string) => {
    setActiveVaultId(vaultId);
    goVaultHome();
    touchRecentKey(`vault:${vaultId}`);
    await loadVaultContents(vaultId);
    const m = await api.vaults.members(vaultId).catch(() => ({ items: [] }));
    setVaultMembers(m.items);
    const found = vaults.find((v) => v.id === vaultId);
    if (found) showToast(found.kind === "shared" ? `Shared Vault · ${found.name}` : found.name);
  };

  const handleOpenRoot = (id: string) => {
    if (id === "__vision_board__") {
      setRootId(null);
      setSubId(null);
      setViewingTrash(false);
      setInProgressOpen(false);
      setVisionBoardOpen(true);
      setCreatingFolder(false);
      setPlusMenuOpen(false);
      return;
    }
    if (id === "__in_progress__" || (inProgressRootFolder && id === inProgressRootFolder.id)) {
      setRootId(inProgressRootFolder ? inProgressRootFolder.id : null);
      setSubId(null);
      setViewingTrash(false);
      setVisionBoardOpen(false);
      setInProgressOpen(true);
      setCreatingFolder(false);
      setPlusMenuOpen(false);
      return;
    }
    setRootId(id);
    setSubId(null);
    setViewingTrash(false);
    setVisionBoardOpen(false);
    setInProgressOpen(false);
    setCreatingFolder(false);
    setPlusMenuOpen(false);
  };

  const handleOpenFolder = (root: string, sub: string | null) => {
    handleOpenRoot(root);
    setSubId(sub);
    setSearch("");
    touchRecentKey(`go:${sub ?? root}`);
  };

  const handleReorderFolder = useCallback(
    (sourceFolderId: string, targetFolderId: string) => {
      if (sourceFolderId === targetFolderId) return;
      const moveInArray = (list: Folder[]): Folder[] | null => {
        const fromIdx = list.findIndex((f) => f.id === sourceFolderId);
        const toIdx = list.findIndex((f) => f.id === targetFolderId);
        if (fromIdx === -1 || toIdx === -1) return null;
        const copy = [...list];
        const [moved] = copy.splice(fromIdx, 1);
        copy.splice(toIdx, 0, moved);
        return copy;
      };

      const persistOrder = (reordered: Folder[]) => {
        const latestMeta = loadPersistedUiMeta();
        const nextFolderMeta = { ...latestMeta.folderMeta };
        reordered.forEach((folder, idx) => {
          const base = resolveFolderUiMeta(folder, nextFolderMeta, idx);
          nextFolderMeta[folder.id] = {
            ...base,
            order: idx,
          };
        });
        const nextMeta: PersistedUiMeta = {
          ...latestMeta,
          folderMeta: nextFolderMeta,
        };
        savePersistedUiMeta(nextMeta);
        setUiMeta(nextMeta);
      };

      if (!currentRootFolder) {
        setRootFolders((prev) => {
          const next = moveInArray(prev);
          if (!next) return prev;
          persistOrder(next);
          return next;
        });
      } else {
        const parentId = currentRootFolder.id;
        setSubfoldersByRoot((prev) => {
          const list = prev[parentId] ?? [];
          const next = moveInArray(list);
          if (!next) return prev;
          persistOrder(next);
          return { ...prev, [parentId]: next };
        });
      }
    },
    [currentRootFolder],
  );

  const handleConfirmCreateFolder = async () => {
    if (!activeVaultId || !newFolderName.trim()) return;
    const name = newFolderName.trim();
    const desc =
      newFolderDesc.trim() || (currentRootFolder ? "custom subfolder" : "custom folder");

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
      await loadVaultContents(activeVaultId);
      showToast(
        currentRootFolder
          ? `Created subfolder "${name}" in ${currentRootFolder.name}`
          : `Created folder "${name}"`,
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
      try {
        await api.vaults.invite(vault.id, { email: otherEmail, role: "editor" });
      } catch {
        // Partner account may not be registered yet on a fresh deployment
      }

      const { items: refreshedVaults } = await api.vaults.list();
      setVaults(refreshedVaults);
      setActiveVaultId(vault.id);
      setCreatingSharedVault(false);
      setNewSharedVaultName("");
      resetNavigation();
      await loadVaultContents(vault.id);
      const m = await api.vaults.members(vault.id);
      setVaultMembers(m.items);
      showToast(`Created "${name}"`);
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

  const handleRemoveMember = async (targetUserId: string) => {
    if (!activeVaultId) return;
    try {
      await api.vaults.removeMember(activeVaultId, targetUserId);
      const m = await api.vaults.members(activeVaultId);
      setVaultMembers(m.items);
      showToast("Removed collaborator from Shared Vault");
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    }
  };

  const handleRenameSharedVault = async (nextName: string) => {
    if (!activeVaultId || !nextName.trim()) return;
    try {
      const updated = await api.vaults.rename(activeVaultId, { name: nextName.trim() });
      setVaults((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
      showToast(`Renamed Shared Vault to "${updated.name}"`);
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    }
  };

  const handleRenameFolder = async (target: Folder) => {
    if (!activeVaultId) return;
    const nextName =
      typeof window !== "undefined" && typeof window.prompt === "function"
        ? window.prompt("Rename folder:", target.name)
        : null;
    if (!nextName || !nextName.trim() || nextName.trim() === target.name) return;
    try {
      const updated = await api.folders.update(activeVaultId, target.id, {
        name: nextName.trim(),
        ifUpdatedAt: target.updatedAt,
      });
      await loadVaultContents(activeVaultId);
      showToast(`Renamed folder to "${updated.name}"`);
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    }
  };

  const handleTrashFolder = async (target: Folder) => {
    if (!activeVaultId) return;
    try {
      await api.folders.trash(activeVaultId, target.id);
      if (target.id === subId) setSubId(null);
      else if (target.id === rootId) setRootId(null);
      await loadVaultContents(activeVaultId);
      showToast(`Moved folder "${target.name}" to Trash`);
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    }
  };

  const handleRenameFile = async (file: FileItem, nextName: string) => {
    if (!activeVaultId || !nextName.trim()) return;
    try {
      const updated = await api.files.update(activeVaultId, file.id, {
        name: nextName.trim(),
        ifUpdatedAt: file.updatedAt,
      });
      setActivePopoverFile(updated);
      await loadVaultContents(activeVaultId);
      showToast(`Renamed to "${updated.name}"`);
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    }
  };

  const handlePreviewShareToken = useCallback(async (token: string) => {
    setActivePopoverFile(null);
    setPublicShareToken(token);
    setPublicShareFile(null);
    setPublicShareRole(null);
    setPublicShareExpiresAt(null);
    setPublicShareError(null);
    try {
      const resolved = await api.shares.resolve(token);
      setPublicShareFile(resolved.file);
      setPublicShareRole(resolved.role);
      setPublicShareExpiresAt(resolved.expiresAt);
      try {
        const wf = await api.files.waveform(resolved.file.vaultId, resolved.file.id, { token });
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
    } catch (err) {
      setPublicShareError(
        err instanceof BpackzApiError ? err.message : "Share link expired or invalid",
      );
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const match = window.location.pathname.match(/^\/s\/([A-Za-z0-9_-]{32,})$/);
    if (match?.[1]) {
      void handlePreviewShareToken(match[1]);
    }
  }, [handlePreviewShareToken]);

  const runMultipartUpload = async (
    targetVaultId: string,
    targetFolderId: string | null,
    name: string,
    size: number,
    mime: string | null,
    payload?: Blob,
  ) => {
    const blobToUpload = payload ?? createSampleWavBlob();
    const actualSize = payload ? Math.max(1, size) : Math.max(1, blobToUpload.size);
    const sha256 = await computeBlobSha256(blobToUpload, name, actualSize);
    const init = await api.uploads.create(targetVaultId, {
      folderId: targetFolderId,
      name,
      size: actualSize,
      mime: mime || "audio/wav",
      sha256,
    });

    if (init.dedup) return showUploadedFile(setFilesByFolder, init.file, activeVaultId);

    const partNumbers = Array.from({ length: init.partCount }, (_, i) => i + 1);
    const signed = await api.uploads.sign(targetVaultId, init.uploadId, {
      key: init.key,
      partNumbers,
    });

    const completedParts: { partNumber: number; etag: string }[] = [];
    for (const p of signed.urls) {
      const start = (p.partNumber - 1) * init.partSize;
      const end = Math.min(blobToUpload.size, start + init.partSize);
      const partSlice =
        blobToUpload.size > 0 ? blobToUpload.slice(start, end) : new Uint8Array([0]);
      const putRes = await fetch(p.url, {
        method: "PUT",
        body: partSlice,
      });
      const etag = putRes.headers.get("ETag") || `"etag-${p.partNumber}"`;
      completedParts.push({ partNumber: p.partNumber, etag });
    }

    const uploaded = await api.uploads.complete(targetVaultId, init.uploadId, {
      key: init.key,
      folderId: targetFolderId,
      name,
      mime: mime || "audio/wav",
      sha256,
      parts: completedParts,
    });
    return showUploadedFile(setFilesByFolder, uploaded, activeVaultId);
  };

  const ensureInProgressSongEcosystem = useCallback(
    async (
      vaultId: string,
      rawSongTitle: string,
    ): Promise<{
      ipRoot: Folder;
      songFolder: Folder;
      bucketFolders: Record<InProgressBucketKey, Folder>;
    }> => {
      const rootListing = await api.files.listChildren(vaultId);
      let ipRoot =
        rootListing.folders.find(
          (f) => f.name.trim().toLowerCase() === IN_PROGRESS_ROOT_FOLDER_NAME,
        ) ?? null;
      if (!ipRoot) {
        ipRoot = await api.folders.create(vaultId, {
          name: IN_PROGRESS_ROOT_FOLDER_NAME,
          parentId: null,
        });
      }

      const cleanSongTitle =
        rawSongTitle
          .replace(/[/\\]+/g, "-")
          .trim()
          .slice(0, 120) || "Untitled Session";

      const ipListing = await api.files.listChildren(vaultId, { folderId: ipRoot.id });
      let songFolder =
        ipListing.folders.find(
          (f) => f.name.trim().toLowerCase() === cleanSongTitle.toLowerCase(),
        ) ?? null;
      if (!songFolder) {
        songFolder = await api.folders.create(vaultId, {
          name: cleanSongTitle,
          parentId: ipRoot.id,
        });
      }

      const songListing = await api.files.listChildren(vaultId, { folderId: songFolder.id });
      const bucketFolders = {} as Record<InProgressBucketKey, Folder>;
      for (const spec of IN_PROGRESS_BUCKETS) {
        let bf =
          songListing.folders.find((f) => f.name.trim().toLowerCase() === spec.key) ?? null;
        if (!bf) {
          bf = await api.folders.create(vaultId, {
            name: spec.key,
            parentId: songFolder.id,
          });
        }
        bucketFolders[spec.key] = bf;
      }

      return { ipRoot, songFolder, bucketFolders };
    },
    [],
  );

  const uploadSafeFileToFolder = async (
    vaultId: string,
    folderId: string,
    rawName: string,
    size: number,
    mime: string,
    blob?: Blob,
  ): Promise<FileItem> => {
    const cleanName = (rawName.split("/").pop()?.split("\\").pop() ?? rawName).trim();
    try {
      return await runMultipartUpload(vaultId, folderId, cleanName, size, mime, blob);
    } catch (err) {
      if (err instanceof BpackzApiError && err.status === 409) {
        const dotIdx = cleanName.lastIndexOf(".");
        const suffixed =
          dotIdx > 0
            ? `${cleanName.slice(0, dotIdx)}_${Math.floor(10 + Math.random() * 89)}${cleanName.slice(dotIdx)}`
            : `${cleanName}_${Math.floor(10 + Math.random() * 89)}`;
        return await runMultipartUpload(vaultId, folderId, suffixed, size, mime, blob);
      }
      throw err;
    }
  };

  const handleCreateEmptyInProgressSong = async (songTitle: string) => {
    if (!activeVaultId || !songTitle.trim()) return;
    setInProgressImporting(true);
    setInProgressStatusText(`Creating "${songTitle.trim()}" song ecosystem...`);
    try {
      const { songFolder } = await ensureInProgressSongEcosystem(activeVaultId, songTitle);
      await loadVaultContents(activeVaultId);
      setActiveInProgressSongId(songFolder.id);
      setActiveInProgressBucket("all");
      showToast(
        `Created song ecosystem "${songFolder.name}" (beat · main · bg · adlib · demo · mixed)`,
      );
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    } finally {
      setInProgressImporting(false);
      setInProgressStatusText(null);
    }
  };

  const handleImportInProgressSessionFiles = async (
    rawFiles: File[],
    explicitSongTitle?: string,
    detectedContainerName?: string | null,
  ) => {
    if (!activeVaultId || rawFiles.length === 0) return;
    setInProgressImporting(true);
    setInProgressStatusText("Inspecting FL Studio files & archives...");
    try {
      const expandedFiles: File[] = [];
      let containerHint = detectedContainerName ?? null;

      for (const f of rawFiles) {
        if (f.name.toLowerCase().endsWith(".zip")) {
          if (!containerHint) containerHint = f.name;
          setInProgressStatusText(`Unpacking "${f.name}" archive...`);
          try {
            const unzipped = await extractSessionFilesFromZip(f);
            expandedFiles.push(...unzipped);
          } catch {
            showToast(`Could not unpack "${f.name}" — please drop uncompressed WAV/MP3 stems`);
          }
        } else if (isSupportedSessionFile(f.name)) {
          expandedFiles.push(f);
        }
      }

      if (expandedFiles.length === 0) {
        showToast("No audio stems (.wav, .mp3, .flac, .aiff) or .flp found in selection");
        return;
      }

      const inferredTitle =
        explicitSongTitle?.trim() ||
        inferSongTitleFromBatch(
          expandedFiles.map((f) => f.name),
          containerHint,
        );

      setInProgressStatusText(
        `Creating "${inferredTitle}" & routing ${expandedFiles.length} stems...`,
      );
      const { songFolder, bucketFolders } = await ensureInProgressSongEcosystem(
        activeVaultId,
        inferredTitle,
      );

      const counts: Record<InProgressBucketKey, number> = {
        beat: 0,
        main: 0,
        bg: 0,
        adlib: 0,
        demo: 0,
        mixed: 0,
      };

      for (let i = 0; i < expandedFiles.length; i++) {
        const file = expandedFiles[i];
        const bucket = classifyFlStudioStem(file.name, expandedFiles.length);
        const destFolder = bucketFolders[bucket];
        setInProgressStatusText(
          `Uploading [${i + 1}/${expandedFiles.length}] "${file.name}" → /${bucket}...`,
        );
        await uploadSafeFileToFolder(
          activeVaultId,
          destFolder.id,
          file.name,
          file.size || 24_500_000,
          file.type || guessMimeFromFilename(file.name),
          file,
        );
        counts[bucket] += 1;
      }

      await loadVaultContents(activeVaultId);
      setActiveInProgressSongId(songFolder.id);
      setActiveInProgressBucket("all");
      setLastRouteSummary({
        songName: songFolder.name,
        songFolderId: songFolder.id,
        counts,
        totalRouted: expandedFiles.length,
      });
      showToast(
        `Auto-separated ${expandedFiles.length} stems into "${songFolder.name}" ecosystem`,
      );
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    } finally {
      setInProgressImporting(false);
      setInProgressStatusText(null);
    }
  };

  const handleSpawnDemoFlSession = async (customSongTitle?: string) => {
    if (!activeVaultId) return;
    const title =
      customSongTitle?.trim() ||
      `Midnight Bounce ${Math.floor(100 + Math.random() * 899)}`;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    setInProgressImporting(true);
    setInProgressStatusText(`Auto-routing FL Studio session "${title}"...`);
    try {
      const { songFolder, bucketFolders } = await ensureInProgressSongEcosystem(
        activeVaultId,
        title,
      );
      const demoStems: { name: string; size: number; mime: string }[] = [
        { name: `${slug}_Insert_1_Beat_2Track.wav`, size: 47_200_000, mime: "audio/wav" },
        { name: `${slug}_Insert_2_Main_Lead_Vox.wav`, size: 39_400_000, mime: "audio/wav" },
        { name: `${slug}_Insert_3_BG_Harmony_Stack.wav`, size: 31_800_000, mime: "audio/wav" },
        { name: `${slug}_Insert_4_Adlib_Throw_FX.wav`, size: 22_600_000, mime: "audio/wav" },
        { name: `${slug}_Rough_Demo_Bounce.mp3`, size: 8_100_000, mime: "audio/mpeg" },
        { name: `${slug}_Prod_Mixed_Master_v1.wav`, size: 52_400_000, mime: "audio/wav" },
      ];

      const counts: Record<InProgressBucketKey, number> = {
        beat: 0,
        main: 0,
        bg: 0,
        adlib: 0,
        demo: 0,
        mixed: 0,
      };

      for (const stem of demoStems) {
        const bucket = classifyFlStudioStem(stem.name, demoStems.length);
        const destFolder = bucketFolders[bucket];
        await uploadSafeFileToFolder(
          activeVaultId,
          destFolder.id,
          stem.name,
          stem.size,
          stem.mime,
        );
        counts[bucket] += 1;
      }

      await loadVaultContents(activeVaultId);
      setActiveInProgressSongId(songFolder.id);
      setActiveInProgressBucket("all");
      setLastRouteSummary({
        songName: songFolder.name,
        songFolderId: songFolder.id,
        counts,
        totalRouted: demoStems.length,
      });
      showToast(`Created "${songFolder.name}" & separated 6 FL Studio tracks into subfolders`);
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    } finally {
      setInProgressImporting(false);
      setInProgressStatusText(null);
    }
  };

  const handleUploadToSongBucket = async (
    songFolderId: string,
    targetBucket: InProgressBucketKey | "auto",
    rawFiles: File[],
  ) => {
    if (!activeVaultId || rawFiles.length === 0) return;
    const songEco = inProgressSongs.find((s) => s.songFolder.id === songFolderId);
    if (!songEco) return;

    setInProgressImporting(true);
    setInProgressStatusText(`Adding files to "${songEco.songFolder.name}"...`);
    try {
      const { bucketFolders } = await ensureInProgressSongEcosystem(
        activeVaultId,
        songEco.songFolder.name,
      );

      const expandedFiles: File[] = [];
      for (const f of rawFiles) {
        if (f.name.toLowerCase().endsWith(".zip")) {
          const unzipped = await extractSessionFilesFromZip(f).catch(() => []);
          expandedFiles.push(...unzipped);
        } else {
          expandedFiles.push(f);
        }
      }

      const counts: Record<InProgressBucketKey, number> = {
        beat: 0,
        main: 0,
        bg: 0,
        adlib: 0,
        demo: 0,
        mixed: 0,
      };

      for (const file of expandedFiles) {
        const resolvedBucket =
          targetBucket === "auto"
            ? classifyFlStudioStem(file.name, expandedFiles.length)
            : targetBucket;
        const destFolder = bucketFolders[resolvedBucket];
        await uploadSafeFileToFolder(
          activeVaultId,
          destFolder.id,
          file.name,
          file.size || 24_500_000,
          file.type || guessMimeFromFilename(file.name),
          file,
        );
        counts[resolvedBucket] += 1;
      }

      await loadVaultContents(activeVaultId);
      setLastRouteSummary({
        songName: songEco.songFolder.name,
        songFolderId: songEco.songFolder.id,
        counts,
        totalRouted: expandedFiles.length,
      });
      showToast(
        targetBucket === "auto"
          ? `Auto-sorted ${expandedFiles.length} file(s) into "${songEco.songFolder.name}"`
          : `Uploaded ${expandedFiles.length} file(s) to ${songEco.songFolder.name} / ${targetBucket}`,
      );
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    } finally {
      setInProgressImporting(false);
      setInProgressStatusText(null);
    }
  };

  const handleMoveFileToBucket = async (
    file: FileItem,
    songFolderId: string,
    targetBucket: InProgressBucketKey,
  ) => {
    if (!activeVaultId) return;
    const songEco = inProgressSongs.find((s) => s.songFolder.id === songFolderId);
    if (!songEco) return;
    try {
      const { bucketFolders } = await ensureInProgressSongEcosystem(
        activeVaultId,
        songEco.songFolder.name,
      );
      const destFolder = bucketFolders[targetBucket];
      await api.files.update(activeVaultId, file.id, {
        folderId: destFolder.id,
        ifUpdatedAt: file.updatedAt,
      });
      await loadVaultContents(activeVaultId);
      showToast(`Moved "${file.name}" → /${targetBucket}`);
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    }
  };

  const handleRenameInProgressSong = async (songFolder: Folder) => {
    if (!activeVaultId) return;
    const nextName =
      typeof window !== "undefined" && typeof window.prompt === "function"
        ? window.prompt("Rename song session:", songFolder.name)
        : null;
    if (!nextName || !nextName.trim() || nextName.trim() === songFolder.name) return;
    try {
      const updated = await api.folders.update(activeVaultId, songFolder.id, {
        name: nextName.trim(),
        ifUpdatedAt: songFolder.updatedAt,
      });
      await loadVaultContents(activeVaultId);
      showToast(`Renamed song ecosystem to "${updated.name}"`);
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    }
  };

  const handleTrashInProgressSong = async (songFolder: Folder) => {
    if (!activeVaultId) return;
    try {
      await api.folders.trash(activeVaultId, songFolder.id);
      if (activeInProgressSongId === songFolder.id) {
        setActiveInProgressSongId(null);
      }
      await loadVaultContents(activeVaultId);
      showToast(`Moved song "${songFolder.name}" to Trash`);
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    }
  };

  const handleUploadTo = (folderId: string | null) => {
    uploadFolderRef.current = folderId;
    fileInputRef.current?.click();
  };

  const handleUploadSelection = async (files: FileList | null) => {
    if (!activeVaultId) return;
    const targetFolderId = uploadFolderRef.current ?? activeFolderId ?? rootFolders[0]?.id ?? null;

    const pinFileToVisionBoardIfActive = (uploadedFile: FileItem) => {
      if (!viewingVisionBoard) return;
      const offset = (activeVisionBoardState.fileNodes.length % 4) * 50;
      handleUpdateVisionBoard({
        ...activeVisionBoardState,
        fileNodes: [
          ...activeVisionBoardState.fileNodes,
          {
            id: `vb_fn_${Date.now()}`,
            fileId: uploadedFile.id,
            fileName: uploadedFile.name,
            fileSize: uploadedFile.size,
            fileMime: uploadedFile.mime,
            addedBy: user?.name ?? "Swish",
            x: 160 + offset,
            y: 220 + offset,
            comments: [],
          },
        ],
      });
    };

    try {
      if (files && files.length > 0) {
        let lastUploaded: FileItem | null = null;
        for (const f of Array.from(files)) {
          lastUploaded = await runMultipartUpload(
            activeVaultId,
            targetFolderId,
            f.name,
            f.size || 24_500_000,
            f.type || "audio/wav",
            f,
          );
          pinFileToVisionBoardIfActive(lastUploaded);
        }
        await loadVaultContents(activeVaultId);
        showToast(
          viewingVisionBoard
            ? `Pinned "${lastUploaded?.name ?? "song"}" to Vision Board`
            : lastUploaded?.status === "processing"
              ? `Uploaded ${files.length} file${files.length > 1 ? "s" : ""} · verifying integrity...`
              : `Uploaded ${files.length} master file${files.length > 1 ? "s" : ""}`,
        );
      } else {
        const sampleName = `${currentUserKey}_take_${Math.floor(100 + Math.random() * 899)}.wav`;
        const uploaded = await runMultipartUpload(
          activeVaultId,
          targetFolderId,
          sampleName,
          38_400_000,
          "audio/wav",
        );
        pinFileToVisionBoardIfActive(uploaded);
        await loadVaultContents(activeVaultId);
        showToast(
          viewingVisionBoard
            ? `Uploaded & pinned "${sampleName}" to Vision Board`
            : uploaded.status === "processing"
              ? `Uploaded "${sampleName}" · verifying integrity...`
              : `Uploaded "${sampleName}"`,
        );
      }
      setPlusMenuOpen(false);
    } catch (err) {
      if (err instanceof BpackzApiError) showToast(err.message);
    }
  };

  const handleTogglePlay = async (file: FileItem) => {
    if (!activeVaultId) return;
    if (file.status && file.status !== "ready") {
      showToast(
        file.status === "failed"
          ? "Upload failed — click Retry to upload again"
          : "File is still verifying...",
      );
      return;
    }
    if (playingFile?.id === file.id) {
      if (audioRef.current) {
        if (audioRef.current.paused) {
          void audioRef.current.play().catch(() => {});
          setIsPaused(false);
        } else {
          audioRef.current.pause();
          setIsPaused(true);
        }
      } else {
        setIsPaused((p) => !p);
      }
      return;
    }
    setPlayingFile(file);
    setIsPaused(false);
    setPlayProgress(0);
    touchRecentKey(`play:${file.id}`);
    try {
      const { url } = await api.files.downloadUrl(activeVaultId, file.id, {
        disposition: "inline",
      });
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.currentTime = 0;
        void audioRef.current.play().catch(() => {});
      }
    } catch {
      // ignore if audio stream is unavailable
    }
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

  const handlePlayFileId = (fileId: string) => {
    const found = allVaultFilesFlat.find((f) => f.id === fileId);
    if (found) void handleTogglePlay(found);
    else showToast("File is no longer in this vault");
  };

  const handleChangeLook = (next: VaultLook) =>
    setUiMeta((prev) => persistUiMeta({ ...prev, look: next }));

  const handleDownloadFile = async (file: FileItem) => {
    if (!activeVaultId) return;
    if (file.status && file.status !== "ready") {
      showToast(
        file.status === "failed"
          ? "Upload failed — click Retry to upload again"
          : "File is still verifying...",
      );
      return;
    }
    try {
      const { url } = await api.files.downloadUrl(activeVaultId, file.id, {
        disposition: "attachment",
      });
      if (typeof document !== "undefined") {
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      showToast(`Presigned download ready · ${file.name}`);
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

      if (file.sha256 && file.sha256.length === 64) {
        const init = await api.uploads.create(sharedVault.id, {
          folderId: destFolder.id,
          name: file.name,
          size: Math.max(1, file.size),
          mime: file.mime,
          sha256: file.sha256,
        });
        if (!init.dedup) {
          await api.uploads.abort(sharedVault.id, init.uploadId, init.key).catch(() => {});
          let sourceBlob: Blob | undefined;
          if (activeVaultId) {
            try {
              const dl = await api.files.downloadUrl(activeVaultId, file.id, {
                disposition: "inline",
              });
              const resp = await fetch(dl.url);
              if (resp.ok) sourceBlob = await resp.blob();
            } catch {
              // fallback if download fetch fails
            }
          }
          await runMultipartUpload(
            sharedVault.id,
            destFolder.id,
            file.name,
            file.size,
            file.mime,
            sourceBlob,
          );
        }
      } else {
        await runMultipartUpload(
          sharedVault.id,
          destFolder.id,
          file.name,
          file.size,
          file.mime,
        );
      }

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
      showToast("Stopped sharing · that link no longer works");
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
      if (entry.file.sha256 && entry.file.sha256.length === 64) {
        const init = await api.uploads.create(activeVaultId, {
          folderId: entry.file.folderId,
          name: entry.file.name,
          size: Math.max(1, entry.file.size),
          mime: entry.file.mime,
          sha256: entry.file.sha256,
        });
        if (!init.dedup) {
          await api.uploads.abort(activeVaultId, init.uploadId, init.key).catch(() => {});
          await runMultipartUpload(
            activeVaultId,
            entry.file.folderId,
            entry.file.name,
            entry.file.size,
            entry.file.mime,
          );
        }
      } else {
        await runMultipartUpload(
          activeVaultId,
          entry.file.folderId,
          entry.file.name,
          entry.file.size,
          entry.file.mime,
        );
      }
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

  const handleAuthSubmit = async (
    e: React.FormEvent,
    inviteCode?: string,
    rememberMe = true,
  ): Promise<boolean> => {
    e.preventDefault();
    setAuthError(null);
    try {
      if (authMode === "signin") {
        await api.auth.signInEmail({
          email: authEmail.trim(),
          password: authPassword,
          rememberMe,
        });
      } else {
        await api.auth.signUpEmail({
          name: authName.trim() || "Producer",
          email: authEmail.trim(),
          password: authPassword,
          inviteCode: inviteCode?.trim(),
        });
      }
      setAuthModalOpen(false);
      await bootstrapSession("personal");
      showToast("Signed in to The Vault");
      return true;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Authentication failed");
      return false;
    }
  };

  const handleSignOut = async () => {
    await api.auth.signOut();
    if (typeof window !== "undefined") {
      window.localStorage?.removeItem(VAULT_GATE_SESSION_KEY);
      window.sessionStorage?.removeItem(VAULT_GATE_SESSION_KEY);
    }
    setVaultGateUnlocked(false);
    setUser(null);
    setVaults([]);
    setActiveVaultId(null);
    setRootFolders([]);
    setSubfoldersByRoot({});
    setFilesByFolder({});
    setAuthName("");
    setAuthEmail("");
    setAuthPassword("");
    setAuthError(null);
    setAuthModalOpen(false);
    showToast("Vault locked & signed out");
  };

  if ((!vaultGateUnlocked || !user) && !publicShareToken) {
    return (
      <VaultGateScreen
        authMode={authMode}
        authName={authName}
        authEmail={authEmail}
        authPassword={authPassword}
        authError={authError}
        onChangeMode={(m) => {
          setAuthMode(m);
          setAuthError(null);
        }}
        onChangeName={setAuthName}
        onChangeEmail={setAuthEmail}
        onChangePassword={setAuthPassword}
        onSubmitAuth={handleAuthSubmit}
        onUnlock={(rememberMe = true) => {
          if (typeof window !== "undefined") {
            window.sessionStorage?.setItem(VAULT_GATE_SESSION_KEY, "1");
            if (rememberMe) {
              window.localStorage?.setItem(VAULT_GATE_SESSION_KEY, "1");
            } else {
              window.localStorage?.removeItem(VAULT_GATE_SESSION_KEY);
            }
          }
          setVaultGateUnlocked(true);
        }}
      />
    );
  }

  return (
    <VaultWorkspace
      {...{ user, authLoading, toast, look, uiMeta, vaults, activeVault, isSharedMode, vaultMembers }}
      {...{ subfoldersByRoot, filesByFolder, currentRootFolder, currentSubFolder, currentSubfolders }}
      {...{ trashedList, viewingTrash, viewingInProgress, viewingVisionBoard, search, whoFilter }}
      {...{ fileLayout, libraryPill, sharedOpen, profileOpen, plusMenuOpen, inviteEmail, inviteRole }}
      {...{ playingFile, isPaused, playProgress, inProgressSongs, activeInProgressSongId }}
      {...{ activeInProgressBucket, inProgressImporting, inProgressStatusText, lastRouteSummary }}
      {...{ setSearch, setWhoFilter, setFileLayout, setLibraryPill, setSharedOpen, setProfileOpen }}
      {...{ setPlusMenuOpen, setViewingTrash, setInProgressOpen, setVisionBoardOpen, setCreatingFolder }}
      {...{ setCreatingSharedVault, setInviteEmail, setInviteRole, setActiveInProgressSongId }}
      {...{ setActiveInProgressBucket, roots: visibleRoots, visionBoard: activeVisionBoardState }}
      {...{ onGoVaultHome: goVaultHome, onOpenFolder: handleOpenFolder, onSwitchVault: handleSwitchVault }}
      {...{ onPlayFileId: handlePlayFileId, onChangeLook: handleChangeLook, onSignOut: handleSignOut }}
      {...{ onReorderFolder: handleReorderFolder, onUploadTo: handleUploadTo }}
      {...{ onRenameFolder: handleRenameFolder, onTrashFolder: handleTrashFolder }}
      {...{ onTogglePlay: handleTogglePlay, onOpenPopover: handleOpenFilePopover }}
      {...{ onRestoreFromTrash: handleRestoreFromTrash, onInviteMember: handleInviteMember }}
      {...{ onRemoveMember: handleRemoveMember, onRenameVault: handleRenameSharedVault }}
      {...{ onUpdateVisionBoard: handleUpdateVisionBoard }}
      {...{ onImportSessionFiles: handleImportInProgressSessionFiles }}
      {...{ onCreateEmptySong: handleCreateEmptyInProgressSong }}
      {...{ onSpawnDemoFlSession: handleSpawnDemoFlSession, onUploadToSongBucket: handleUploadToSongBucket }}
      {...{ onMoveFileToBucket: handleMoveFileToBucket, onRenameSong: handleRenameInProgressSong }}
      {...{ onTrashSong: handleTrashInProgressSong }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void handleUploadSelection(e.target.files)}
      />
      <audio
        ref={audioRef}
        loop={loopEnabled}
        className="hidden"
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration && Number.isFinite(el.duration) && el.duration > 0) {
            setPlayDuration(el.duration);
            setPlayProgress(Math.min(100, Math.round((el.currentTime / el.duration) * 100)));
          }
        }}
        onEnded={() => {
          if (!loopEnabled) setPlayingFile(null);
        }}
      />

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
          onPreviewShareToken={(tok) => void handlePreviewShareToken(tok)}
          onRenameFile={(f, nextName) => void handleRenameFile(f, nextName)}
          onDownload={(f) => void handleDownloadFile(f)}
          onSoftDelete={(f) => void handleSoftDeleteFile(f)}
        />
      )}

      {publicShareToken && (
        <PublicShareLandingModal
          token={publicShareToken}
          resolvedFile={publicShareFile}
          resolvedRole={publicShareRole}
          resolvedExpiresAt={publicShareExpiresAt}
          error={publicShareError}
          waveformBars={waveformBars}
          isPlaying={Boolean(publicShareFile && playingFile?.id === publicShareFile.id)}
          playProgress={playProgress}
          onTogglePlay={() => {
            if (!publicShareFile) return;
            if (playingFile?.id === publicShareFile.id) {
              audioRef.current?.pause();
              setPlayingFile(null);
              return;
            }
            setPlayingFile(publicShareFile);
            setPlayProgress(0);
            void api.files
              .downloadUrl(publicShareFile.vaultId, publicShareFile.id, {
                disposition: "inline",
                token: publicShareToken,
              })
              .then(({ url }) => {
                if (audioRef.current) {
                  audioRef.current.src = url;
                  audioRef.current.currentTime = 0;
                  void audioRef.current.play().catch(() => {});
                }
              })
              .catch(() => {});
          }}
          onDownload={() => {
            if (!publicShareFile) return;
            void api.files
              .downloadUrl(publicShareFile.vaultId, publicShareFile.id, {
                disposition: "attachment",
                token: publicShareToken,
              })
              .then(({ url }) => {
                if (typeof document !== "undefined") {
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = publicShareFile.name;
                  a.rel = "noopener";
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                }
                showToast(`Downloaded shared file · ${publicShareFile.name}`);
              })
              .catch((err) => {
                if (err instanceof BpackzApiError) showToast(err.message);
              });
          }}
          onClose={() => {
            setPublicShareToken(null);
            if (typeof window !== "undefined" && window.location.pathname.startsWith("/s/")) {
              window.history.replaceState(null, "", "/");
            }
          }}
        />
      )}

      {creatingFolder && (
        <CreateFolderModal
          currentRootFolder={currentRootFolder}
          newFolderName={newFolderName}
          newFolderDesc={newFolderDesc}
          newFolderIconKey={newFolderIconKey}
          newFolderColorIdx={newFolderColorIdx}
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
          isPaused={isPaused}
          waveformBars={waveformBars}
          playProgress={playProgress}
          durationSec={playDuration}
          loopEnabled={loopEnabled}
          vaultMembers={vaultMembers}
          currentUser={user}
          onTogglePause={() => {
            if (audioRef.current) {
              if (audioRef.current.paused) {
                void audioRef.current.play().catch(() => {});
                setIsPaused(false);
              } else {
                audioRef.current.pause();
                setIsPaused(true);
              }
            } else {
              setIsPaused((p) => !p);
            }
          }}
          onToggleLoop={() => setLoopEnabled((v) => !v)}
          onSeek={(pct) => {
            setPlayProgress(pct);
            if (
              audioRef.current &&
              audioRef.current.duration &&
              Number.isFinite(audioRef.current.duration)
            ) {
              audioRef.current.currentTime = (pct / 100) * audioRef.current.duration;
            }
          }}
          onShare={(f) => void handleOpenFilePopover(f)}
          onDownload={(f) => void handleDownloadFile(f)}
          onClose={() => {
            audioRef.current?.pause();
            setPlayingFile(null);
          }}
        />
      )}
    </VaultWorkspace>
  );
}

export default App;
