import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Folder } from "@bpackz/shared";
import { CreateRecordHardwareButton, RecordHardwareItem } from "../HardwareIcons.tsx";
import {
  resolveFolderUiMeta,
  type FolderUiMeta,
  type HardwareThemeSlot,
} from "../vaultTheme.ts";

export type StudioIconName =
  | "back"
  | "chevron-right"
  | "home"
  | "search"
  | "users"
  | "user-plus"
  | "sign-out"
  | "sign-in"
  | "replay"
  | "list"
  | "trash"
  | "plus"
  | "folder-plus"
  | "upload"
  | "download"
  | "share"
  | "more"
  | "check"
  | "send"
  | "restore"
  | "link"
  | "loop"
  | "play"
  | "pause";

export function StudioIcon({
  name,
  className = "w-4 h-4",
}: {
  name: StudioIconName;
  className?: string;
}) {
  switch (name) {
    case "back":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      );
    case "home":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case "search":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="11" cy="11" r="7" />
          <line x1="20" y1="20" x2="16.2" y2="16.2" />
        </svg>
      );
    case "users":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "user-plus":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
      );
    case "sign-out":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      );
    case "sign-in":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          <polyline points="10 17 15 12 10 7" />
          <line x1="15" y1="12" x2="3" y2="12" />
        </svg>
      );
    case "replay":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
          <path d="M16 16h5v5" />
        </svg>
      );
    case "list":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <circle cx="4" cy="6" r="1" fill="currentColor" />
          <circle cx="4" cy="12" r="1" fill="currentColor" />
          <circle cx="4" cy="18" r="1" fill="currentColor" />
        </svg>
      );
    case "trash":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case "plus":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case "folder-plus":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          <line x1="12" y1="11" x2="12" y2="17" />
          <line x1="9" y1="14" x2="15" y2="14" />
        </svg>
      );
    case "upload":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      );
    case "download":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M12 4v11" />
          <polyline points="8 11 12 15 16 11" />
          <line x1="6" y1="19" x2="18" y2="19" />
        </svg>
      );
    case "share":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      );
    case "more":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      );
    case "check":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case "send":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      );
    case "restore":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      );
    case "link":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
    case "loop":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
          <polyline points="17 1 21 5 17 9" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <polyline points="7 23 3 19 7 15" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      );
    case "play":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      );
    case "pause":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      );
  }
}

export function StudioModal({
  title,
  maxWidthClass = "max-w-md",
  alignBottomOnMobile = false,
  onClose,
  children,
}: {
  title?: ReactNode;
  maxWidthClass?: string;
  alignBottomOnMobile?: boolean;
  onClose?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
      className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex ${
        alignBottomOnMobile
          ? "items-end sm:items-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4"
          : "items-center p-3 sm:p-4"
      } justify-center`}
    >
      <div
        className={`w-full ${maxWidthClass} max-h-[88dvh] flex flex-col rounded-3xl bg-[var(--bg)] border border-[var(--ink)]/25 shadow-2xl overflow-hidden popover-sheet`}
      >
        {title !== undefined && (
          <div className="px-5 py-3.5 border-b border-[var(--hair)] bg-[var(--card)] flex items-center justify-between shrink-0">
            <span className="mono-meta text-[11px] uppercase text-[var(--ink)]">{title}</span>
            {onClose && (
              <button type="button" onClick={onClose} className="icon-btn w-8 h-8 text-xs">
                ×
              </button>
            )}
          </div>
        )}
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

export function HardwareGridSection({
  folders,
  folderMetaMap,
  activePalette,
  animateSpawn,
  createLabel,
  isSharedMainPage = false,
  folderHasPlayingTrack,
  onSelectFolder,
  onReorderFolder,
  onCreateClick,
}: {
  folders: Folder[];
  folderMetaMap: Record<string, FolderUiMeta>;
  activePalette: HardwareThemeSlot[];
  animateSpawn: boolean;
  createLabel: string;
  isSharedMainPage?: boolean;
  folderHasPlayingTrack: (folder: Folder) => boolean;
  onSelectFolder: (folderId: string) => void;
  onReorderFolder?: (sourceFolderId: string, targetFolderId: string) => void;
  onCreateClick: () => void;
}) {
  const [jiggleMode, setJiggleMode] = useState(false);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [dragCursor, setDragCursor] = useState<{ x: number; y: number; width: number } | null>(
    null,
  );
  const gridRef = useRef<HTMLDivElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const pressedRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    width: number;
  } | null>(null);
  const lastSwapAtRef = useRef<number>(0);
  const suppressClickRef = useRef(false);

  const clearHoldTimer = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const pressed = pressedRef.current;
      let activeDragId = draggingFolderId;

      if (!activeDragId && pressed) {
        const dist = Math.hypot(e.clientX - pressed.startX, e.clientY - pressed.startY);
        if (dist > 8) {
          clearHoldTimer();
          if (e.pointerType === "touch") {
            pressedRef.current = null;
            return;
          }
          suppressClickRef.current = true;
          activeDragId = pressed.id;
          setJiggleMode(true);
          setDraggingFolderId(pressed.id);
        }
      }

      if (!activeDragId) return;

      setDragCursor((prev) => ({
        x: e.clientX,
        y: e.clientY,
        width: prev?.width ?? pressed?.width ?? 160,
      }));

      if (!onReorderFolder || !gridRef.current) return;
      const now = performance.now();
      if (now - lastSwapAtRef.current < 110) return;

      const cards = gridRef.current.querySelectorAll<HTMLElement>("[data-folder-id]");
      for (const card of cards) {
        const targetId = card.dataset.folderId;
        if (!targetId || targetId === activeDragId) continue;
        const rect = card.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          lastSwapAtRef.current = now;
          onReorderFolder(activeDragId, targetId);
          break;
        }
      }
    };

    const handlePointerUp = () => {
      clearHoldTimer();
      pressedRef.current = null;
      if (draggingFolderId) {
        setDraggingFolderId(null);
        setDragCursor(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setJiggleMode(false);
        setDraggingFolderId(null);
        setDragCursor(null);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [draggingFolderId, onReorderFolder]);

  const draggedFolderIdx = draggingFolderId
    ? folders.findIndex((f) => f.id === draggingFolderId)
    : -1;
  const draggedFolder = draggedFolderIdx >= 0 ? folders[draggedFolderIdx] : null;
  const draggedMeta =
    draggedFolder && draggedFolderIdx >= 0
      ? resolveFolderUiMeta(draggedFolder, folderMetaMap, draggedFolderIdx, isSharedMainPage)
      : null;
  const draggedTheme = draggedMeta
    ? activePalette[draggedMeta.colorSlot % activePalette.length] ?? activePalette[0]
    : activePalette[0];

  return (
    <section
      className="pt-8 sm:pt-10 pb-8"
      onClick={(e) => {
        if (jiggleMode && e.target === e.currentTarget) {
          setJiggleMode(false);
          setDraggingFolderId(null);
          setDragCursor(null);
        }
      }}
    >
      {jiggleMode && (
        <div className="flex items-center justify-between mb-6 px-4 py-2.5 rounded-2xl bg-[var(--card)] border border-[var(--hair)] shadow-sm">
          <span className="mono-meta text-[11px] uppercase text-[var(--ink-soft)]">
            Drag any 3D icon into a new spot · Order saves automatically
          </span>
          <button
            type="button"
            onClick={() => {
              setJiggleMode(false);
              setDraggingFolderId(null);
              setDragCursor(null);
            }}
            className="px-4 py-1.5 rounded-full bg-[var(--ink)] text-[var(--bg)] mono-meta text-[11px] uppercase cursor-pointer hover:opacity-90"
          >
            Done
          </button>
        </div>
      )}
      <div
        ref={gridRef}
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-8 sm:gap-x-8 sm:gap-y-12"
      >
        {folders.map((folder, idx) => {
          const meta = resolveFolderUiMeta(folder, folderMetaMap, idx, isSharedMainPage);
          const theme = activePalette[meta.colorSlot % activePalette.length] ?? activePalette[0];
          return (
            <RecordHardwareItem
              key={folder.id}
              folderId={folder.id}
              name={folder.name}
              by={meta.by}
              iconKey={meta.iconKey}
              idx={idx}
              theme={theme}
              animateSpawn={animateSpawn}
              isPlayingFolder={folderHasPlayingTrack(folder)}
              jiggleMode={jiggleMode}
              isDragging={draggingFolderId === folder.id}
              onPointerDown={(e) => {
                if (e.button !== 0 && e.pointerType === "mouse") return;
                clearHoldTimer();
                const rect = e.currentTarget.getBoundingClientRect();
                pressedRef.current = {
                  id: folder.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  width: rect.width,
                };
                if (jiggleMode) {
                  suppressClickRef.current = true;
                  setDraggingFolderId(folder.id);
                  setDragCursor({ x: e.clientX, y: e.clientY, width: rect.width });
                  return;
                }
                holdTimerRef.current = window.setTimeout(() => {
                  suppressClickRef.current = true;
                  setJiggleMode(true);
                  setDraggingFolderId(folder.id);
                  setDragCursor({ x: e.clientX, y: e.clientY, width: rect.width });
                }, 200);
              }}
              onClick={() => {
                clearHoldTimer();
                pressedRef.current = null;
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  return;
                }
                if (jiggleMode) return;
                onSelectFolder(folder.id);
              }}
            />
          );
        })}
        <CreateRecordHardwareButton
          label={createLabel}
          idx={folders.length}
          animateSpawn={animateSpawn}
          onClick={onCreateClick}
        />
      </div>

      {draggedFolder && draggedMeta && dragCursor && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: `${dragCursor.x}px`,
            top: `${dragCursor.y}px`,
            width: `${dragCursor.width}px`,
            transform: "translate(-50%, -48%) scale(1.08)",
            filter: "drop-shadow(0 22px 32px rgba(22, 19, 43, 0.28))",
          }}
        >
          <RecordHardwareItem
            name={draggedFolder.name}
            by={draggedMeta.by}
            iconKey={draggedMeta.iconKey}
            idx={draggedFolderIdx}
            theme={draggedTheme}
            animateSpawn={false}
            isPlayingFolder={folderHasPlayingTrack(draggedFolder)}
            onClick={() => {}}
          />
        </div>
      )}
    </section>
  );
}
