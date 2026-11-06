import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Folder } from "@bpackz/shared";
import { resolveFolderCover, type FolderUiMeta } from "../vaultTheme.ts";

/** The one icon set: thin line, one colour, round ends (design system, TOD-108). */
const ICON_PATHS = {
  back: <polyline points="15 18 9 12 15 6" />,
  "chevron-right": <polyline points="9 18 15 12 9 6" />,
  home: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
    </>
  ),
  "user-plus": (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M22 11h-6" />
    </>
  ),
  "sign-out": <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  "sign-in": <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />,
  replay: <path d="M1 4v6h6M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />,
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r=".8" fill="currentColor" />
      <circle cx="4.5" cy="12" r=".8" fill="currentColor" />
      <circle cx="4.5" cy="18" r=".8" fill="currentColor" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  plus: <path d="M12 5v14M5 12h14" />,
  upload: <path d="M12 16V5M8 9l4-4 4 4M5 19h14" />,
  download: <path d="M12 4v11M8 11l4 4 4-4M5 19h14" />,
  share: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="17" cy="6" r="2.5" />
      <circle cx="17" cy="18" r="2.5" />
      <path d="M8.2 10.8l6.6-3.6M8.2 13.2l6.6 3.6" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="18" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  check: <polyline points="20 6 9 17 4 12" />,
  send: <path d="M4 12l16-7-6 16-3-6z" />,
  link: (
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  ),
  loop: <path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4" />,
  play: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
  pause: <path d="M8 5v14M16 5v14" strokeWidth="2.6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  beats: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </>
  ),
  presets: (
    <>
      <path d="M6 4v16M12 4v16M18 4v16" />
      <circle cx="6" cy="9" r="2.2" fill="currentColor" />
      <circle cx="12" cy="15" r="2.2" fill="currentColor" />
      <circle cx="18" cy="8" r="2.2" fill="currentColor" />
    </>
  ),
  vocals: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
    </>
  ),
  songs: (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  media: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" />
    </>
  ),
  board: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 2v4M15 2v4M9 11h6M9 15h4" />
    </>
  ),
  progress: <path d="M5 20V10M12 20V4M19 20v-7" />,
  vault: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 8.5V6M12 18v-2.5" />
    </>
  ),
  file: <path d="M7 3h7l4 4v14H7zM14 3v4h4" />,
  cup: <path d="M7 8h10l-1.5 13h-7zM6 8h12M8.3 13h7.4M14 8l2-5h2.5" />,
  chain: (
    <>
      <path d="M5 3c0 6 3 9 7 10 4-1 7-4 7-10" />
      <path d="M12 13l3 3.5-3 4.5-3-4.5z" />
    </>
  ),
  cash: (
    <>
      <rect x="3" y="5" width="18" height="10" rx="1.5" />
      <circle cx="12" cy="10" r="2.5" />
      <path d="M5 18h14M7 21h10" />
    </>
  ),
  watch: (
    <>
      <circle cx="12" cy="12" r="5.5" />
      <path d="M12 9.5V12l1.8 1.2M9 7l.7-4h4.6l.7 4M9 17l.7 4h4.6l.7-4" />
    </>
  ),
};

export type StudioIconName = keyof typeof ICON_PATHS;

export function StudioIcon({
  name,
  className = "w-4 h-4",
}: {
  name: StudioIconName;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

const FOLDER_ICON_NAMES: Record<string, StudioIconName> = {
  beats: "beats",
  presets: "presets",
  sub_plugin: "presets",
  sub_preamp: "presets",
  sub_mix: "presets",
  vocals: "vocals",
  sub_adlib: "vocals",
  sub_bg: "vocals",
  songs: "songs",
  sub_drop: "songs",
  media: "media",
  sub_video: "media",
  sub_mv: "media",
  sub_covers: "media",
  vision_board: "board",
  in_progress: "progress",
  rap_cup: "cup",
  rap_chain: "chain",
  rap_money: "cash",
  rap_watch: "watch",
};

/** Line icon for a saved folder icon key; unknown keys (such as the dropped car) get the vault icon. */
export function folderIconName(iconKey: string): StudioIconName {
  return FOLDER_ICON_NAMES[iconKey] ?? "vault";
}

/** A colour block with a line icon, used like album art. No colour means a plain tile. */
export function CoverTile({
  icon,
  color,
  size = "",
}: {
  icon: StudioIconName;
  color?: string;
  size?: "" | "bs-cv-lg" | "bs-cv-xl" | "bs-cv-xl bs-cv-new";
}) {
  return (
    <span
      className={`bs-cv ${color ? "" : "bs-cv-plain"} ${size}`}
      style={color ? ({ "--c": color } as CSSProperties) : undefined}
    >
      <StudioIcon name={icon} className="" />
    </span>
  );
}

export function UserAvatarBadge({
  byName,
  sizeClass = "w-5 h-5 text-[9px]",
}: {
  byName: string;
  sizeClass?: string;
}) {
  const clean = (byName || "Swish").trim();
  const lower = clean.toLowerCase();
  const isTodo = lower.includes("todo");
  const isSwish = lower.includes("swish") || clean.length === 0;
  const initial = isTodo ? "T" : isSwish ? "S" : clean.charAt(0).toUpperCase();
  let hash = 0;
  for (let i = 0; i < lower.length; i++) {
    hash = (hash * 31 + lower.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return (
    <span
      title={`Added by ${clean}`}
      className={`${sizeClass} rounded-full inline-flex items-center justify-center font-semibold shrink-0`}
      style={
        isTodo
          ? { background: "#0b0a0c", color: "#ffffff" }
          : isSwish
            ? { background: "#0b0a0c", color: "#ff4a3d" }
            : { background: `hsl(${hue}, 30%, 14%)`, color: `hsl(${hue}, 85%, 72%)` }
      }
    >
      {initial}
    </span>
  );
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

/** One folder as a cover card: colour block, name, one line about what is inside. */
export function FolderCoverCard({
  folder,
  folderMetaMap,
  detail,
  reorderMode = false,
  isDragging = false,
  onClick,
  onPointerDown,
}: {
  folder: Folder;
  folderMetaMap: Record<string, FolderUiMeta>;
  detail: string;
  reorderMode?: boolean;
  isDragging?: boolean;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const cover = resolveFolderCover(folder, folderMetaMap);
  return (
    <button
      type="button"
      data-folder-id={folder.id}
      draggable={false}
      onClick={onClick}
      onPointerDown={onPointerDown}
      className={`bs-card ${reorderMode ? "bs-card-reorder" : ""} ${isDragging ? "bs-card-dragging" : ""}`}
    >
      <CoverTile icon={folderIconName(cover.iconKey)} color={cover.color} size="bs-cv-xl" />
      <span>
        <b>{folder.name}</b>
        <small>{detail}</small>
      </span>
    </button>
  );
}

/** The vault home grid of folder covers. Hold a card (or drag it with a mouse) to reorder. */
export function CoverGridSection({
  folders,
  folderMetaMap,
  describeFolder,
  onSelectFolder,
  onReorderFolder,
  onCreateClick,
}: {
  folders: Folder[];
  folderMetaMap: Record<string, FolderUiMeta>;
  describeFolder: (folder: Folder) => string;
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

  const draggedFolder = folders.find((f) => f.id === draggingFolderId) ?? null;

  return (
    <section
      aria-label="Folders"
      onClick={(e) => {
        if (jiggleMode && e.target === e.currentTarget) {
          setJiggleMode(false);
          setDraggingFolderId(null);
          setDragCursor(null);
        }
      }}
    >
      <span className="bs-label">Folders</span>
      {jiggleMode && (
        <div className="bs-reorder-bar">
          <span className="bs-label">Drag a folder to a new spot. The order saves by itself.</span>
          <button
            type="button"
            onClick={() => {
              setJiggleMode(false);
              setDraggingFolderId(null);
              setDragCursor(null);
            }}
            className="bs-pill"
            aria-pressed="true"
          >
            Done
          </button>
        </div>
      )}
      <div ref={gridRef} className="bs-cards">
        {folders.map((folder) => {
          return (
            <FolderCoverCard
              key={folder.id}
              folder={folder}
              folderMetaMap={folderMetaMap}
              detail={describeFolder(folder)}
              reorderMode={jiggleMode}
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
        <button type="button" className="bs-card" onClick={onCreateClick}>
          <CoverTile icon="plus" size="bs-cv-xl bs-cv-new" />
          <span>
            <b>new folder</b>
            <small>name it, pick an icon</small>
          </span>
        </button>
      </div>

      {draggedFolder && dragCursor && (
        <div
          className="bs-drag-ghost"
          style={{
            left: `${dragCursor.x}px`,
            top: `${dragCursor.y}px`,
            width: `${dragCursor.width}px`,
          }}
        >
          <FolderCoverCard
            folder={draggedFolder}
            folderMetaMap={folderMetaMap}
            detail={describeFolder(draggedFolder)}
          />
        </div>
      )}
    </section>
  );
}
