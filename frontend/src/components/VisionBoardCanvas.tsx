import { useRef, useState } from "react";
import type { FileItem } from "@bpackz/shared";
import { UserAvatarBadge } from "../HardwareIcons.tsx";
import { formatBytes, parseStudioFileDisplay } from "../utils/format.ts";
import {
  STICKY_NOTE_COLORS,
  type HardwareThemeSlot,
  type StickyColorKey,
  type VisionBoardFileNode,
  type VisionBoardNote,
  type VisionBoardVaultState,
} from "../vaultTheme.ts";
import { StudioIcon } from "./StudioPrimitives.tsx";

const MINI_WAVE = [32, 68, 45, 88, 60, 95, 52, 74, 40, 82, 58, 90, 48, 66];
const COLOR_ORDER: StickyColorKey[] = ["canary", "coral", "mint", "lavender"];

export function VisionBoardCanvas({
  boardState,
  vaultFiles,
  currentUserName,
  playingFileId,
  playProgress,
  accentTheme,
  onUpdateBoard,
  onTogglePlayFile,
  onUploadSongToBoard,
}: {
  boardState: VisionBoardVaultState;
  vaultFiles: FileItem[];
  currentUserName: string;
  playingFileId: string | null;
  playProgress: number;
  accentTheme: HardwareThemeSlot;
  onUpdateBoard: (next: VisionBoardVaultState) => void;
  onTogglePlayFile: (fileId: string, fallbackName: string, fallbackSize: number) => void;
  onUploadSongToBoard: () => void;
}) {
  const [pan, setPan] = useState<{ x: number; y: number }>(() =>
    typeof window !== "undefined" && window.innerWidth < 640 ? { x: 12, y: 12 } : { x: 20, y: 16 },
  );
  const [zoom, setZoom] = useState<number>(() =>
    typeof window !== "undefined" && window.innerWidth < 640 ? 0.78 : 1,
  );
  const [selectedStickyColor, setSelectedStickyColor] = useState<StickyColorKey>("canary");
  const [trackPickerOpen, setTrackPickerOpen] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [timestampDrafts, setTimestampDrafts] = useState<Record<string, string>>({});

  const dragRef = useRef<{
    kind: "pan" | "note" | "file";
    id?: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const handlePointerDownPan = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-board-card]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: "pan",
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: pan.x,
      origY: pan.y,
    };
  };

  const handlePointerDownItem = (
    e: React.PointerEvent<HTMLElement>,
    kind: "note" | "file",
    id: string,
    origX: number,
    origY: number,
  ) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind,
      id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX,
      origY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const active = dragRef.current;
    if (!active) return;
    const dx = e.clientX - active.startClientX;
    const dy = e.clientY - active.startClientY;

    if (active.kind === "pan") {
      setPan({ x: active.origX + dx, y: active.origY + dy });
      return;
    }

    const scaledDx = Math.round(dx / zoom);
    const scaledDy = Math.round(dy / zoom);

    if (active.kind === "note" && active.id) {
      onUpdateBoard({
        ...boardState,
        notes: boardState.notes.map((n) =>
          n.id === active.id ? { ...n, x: active.origX + scaledDx, y: active.origY + scaledDy } : n,
        ),
      });
    } else if (active.kind === "file" && active.id) {
      onUpdateBoard({
        ...boardState,
        fileNodes: boardState.fileNodes.map((fn) =>
          fn.id === active.id
            ? { ...fn, x: active.origX + scaledDx, y: active.origY + scaledDy }
            : fn,
        ),
      });
    }
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      setZoom((z) => Math.min(1.45, Math.max(0.55, Number((z + delta).toFixed(2)))));
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  const handleAddStickyNote = (color: StickyColorKey = selectedStickyColor) => {
    const offsetIdx = boardState.notes.length % 5;
    const newNote: VisionBoardNote = {
      id: `vb_note_${Date.now()}`,
      text: "New studio note — tap to type lyrics, mix feedback, or arrangement ideas...",
      author: currentUserName,
      color,
      x: Math.round((-pan.x + 80 + offsetIdx * 45) / zoom),
      y: Math.round((-pan.y + 70 + offsetIdx * 35) / zoom),
      createdAt: "Just now",
    };
    onUpdateBoard({
      ...boardState,
      notes: [...boardState.notes, newNote],
    });
  };

  const handleUpdateNoteText = (noteId: string, text: string) => {
    onUpdateBoard({
      ...boardState,
      notes: boardState.notes.map((n) => (n.id === noteId ? { ...n, text } : n)),
    });
  };

  const handleCycleNoteColor = (noteId: string, current: StickyColorKey) => {
    const nextColor = COLOR_ORDER[(COLOR_ORDER.indexOf(current) + 1) % COLOR_ORDER.length];
    onUpdateBoard({
      ...boardState,
      notes: boardState.notes.map((n) => (n.id === noteId ? { ...n, color: nextColor } : n)),
    });
  };

  const handleDeleteNote = (noteId: string) => {
    onUpdateBoard({
      ...boardState,
      notes: boardState.notes.filter((n) => n.id !== noteId),
    });
  };

  const handlePinVaultFile = (file: FileItem) => {
    const idx = boardState.fileNodes.length % 4;
    const newNode: VisionBoardFileNode = {
      id: `vb_fn_${Date.now()}`,
      fileId: file.id,
      fileName: file.name,
      fileSize: file.size,
      fileMime: file.mime,
      addedBy: currentUserName,
      x: Math.round((-pan.x + 140 + idx * 55) / zoom),
      y: Math.round((-pan.y + 220 + idx * 45) / zoom),
      comments: [],
    };
    onUpdateBoard({
      ...boardState,
      fileNodes: [...boardState.fileNodes, newNode],
    });
    setTrackPickerOpen(false);
  };

  const handleDeleteFileNode = (nodeId: string) => {
    onUpdateBoard({
      ...boardState,
      fileNodes: boardState.fileNodes.filter((fn) => fn.id !== nodeId),
    });
  };

  const handleAddFileComment = (nodeId: string) => {
    const text = (commentDrafts[nodeId] ?? "").trim();
    if (!text) return;
    const timestampTag = (timestampDrafts[nodeId] ?? "").trim() || undefined;
    onUpdateBoard({
      ...boardState,
      fileNodes: boardState.fileNodes.map((fn) =>
        fn.id === nodeId
          ? {
              ...fn,
              comments: [
                ...fn.comments,
                {
                  id: `vb_c_${Date.now()}`,
                  author: currentUserName,
                  text,
                  timestampTag,
                  createdAt: "Just now",
                },
              ],
            }
          : fn,
      ),
    });
    setCommentDrafts((prev) => ({ ...prev, [nodeId]: "" }));
    setTimestampDrafts((prev) => ({ ...prev, [nodeId]: "" }));
  };

  return (
    <section className="py-5 sm:py-6 space-y-3">
      {/* Top Figma-Style Vision Board Toolbar */}
      <div className="p-3 sm:px-4 sm:py-3 rounded-2xl bg-[var(--card)] border border-[var(--hair)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="mono-meta text-[10px] uppercase px-2.5 py-1 rounded-full font-semibold"
            style={{
              background: accentTheme.chassisBg,
              color: accentTheme.accentPrimary,
              border: `1px solid ${accentTheme.accentPrimary}`,
            }}
          >
            ∞ Collab Vision Board
          </span>
          <span className="text-xs text-[var(--ink-soft)] hidden sm:inline">
            Drag canvas to pan · Drag sticky notes & song cards anywhere · Add timestamped comments
          </span>
        </div>

        {/* Right Zoom & Coordinate HUD */}
        <div className="flex items-center gap-1.5">
          <span className="mono-meta text-[10px] text-[var(--ink-soft)] px-2 py-1 rounded-lg bg-[#f4f1eb] border border-[var(--hair)]">
            X:{Math.round(-pan.x)} Y:{Math.round(-pan.y)}
          </span>
          <div className="inline-flex items-center rounded-xl bg-[#f4f1eb] p-0.5 border border-[var(--hair)]">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.55, Number((z - 0.1).toFixed(2))))}
              className="px-2 py-1 mono-meta text-[10px] cursor-pointer hover:text-[var(--ink)]"
              title="Zoom Out"
            >
              −
            </button>
            <span className="px-2 mono-meta text-[10px] font-semibold">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.45, Number((z + 0.1).toFixed(2))))}
              className="px-2 py-1 mono-meta text-[10px] cursor-pointer hover:text-[var(--ink)]"
              title="Zoom In"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setPan({ x: 20, y: 16 });
              setZoom(1);
            }}
            className="px-2.5 py-1.5 rounded-xl bg-[#f4f1eb] border border-[var(--hair)] mono-meta text-[10px] uppercase cursor-pointer hover:border-[var(--ink)]"
          >
            Center
          </button>
        </div>
      </div>

      {/* Infinite Scroll / Pan Canvas Viewport */}
      <div
        onPointerDown={handlePointerDownPan}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        className="relative w-full h-[640px] sm:h-[700px] rounded-3xl border border-[var(--ink)]/20 overflow-hidden select-none cursor-grab active:cursor-grabbing shadow-inner"
        style={{
          backgroundColor: "#e8e4dc",
          backgroundImage:
            "radial-gradient(circle, rgba(22, 19, 43, 0.22) 1.25px, transparent 1.25px)",
          backgroundSize: `${Math.round(24 * zoom)}px ${Math.round(24 * zoom)}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
          touchAction: "none",
        }}
      >
        {/* Transformed Infinite Plane */}
        <div
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            transformOrigin: "0 0",
            width: "2400px",
            height: "1800px",
            position: "relative",
          }}
        >
          {/* SVG Connection Threads between Notes & Songs */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ overflow: "visible" }}
          >
            {boardState.notes.slice(0, 2).map((note, idx) => {
              const targetFile = boardState.fileNodes[idx];
              if (!targetFile) return null;
              const x1 = note.x + 130;
              const y1 = note.y + 150;
              const x2 = targetFile.x + 170;
              const y2 = targetFile.y + 12;
              return (
                <g key={`${note.id}_${targetFile.id}`}>
                  <path
                    d={`M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`}
                    fill="none"
                    stroke="rgba(22, 19, 43, 0.22)"
                    strokeWidth="2"
                    strokeDasharray="5 5"
                  />
                  <circle cx={x1} cy={y1} r="4" fill={accentTheme.accentPrimary} />
                  <circle cx={x2} cy={y2} r="4" fill={accentTheme.accentPrimary} />
                </g>
              );
            })}
          </svg>

          {/* 1. STUDIO NOTEPAD SHEETS ON INFINITE CANVAS */}
          {boardState.notes.map((note) => {
            const palette = STICKY_NOTE_COLORS[note.color] ?? STICKY_NOTE_COLORS.canary;
            return (
              <div
                key={note.id}
                data-board-card="true"
                style={{
                  position: "absolute",
                  left: `${note.x}px`,
                  top: `${note.y}px`,
                  width: "276px",
                  background: palette.bg,
                  border: `1.5px solid ${palette.border}`,
                  boxShadow:
                    "0 16px 32px rgba(22, 19, 43, 0.2), -3px 4px 0 rgba(22, 19, 43, 0.16), inset 0 1px 0 rgba(255,255,255,0.75)",
                }}
                className="rounded-xl flex flex-col overflow-visible transition-shadow hover:shadow-2xl"
              >
                {/* Chrome Wire-O Spiral Binding Rings Along Top of Notepad Sheet */}
                <div className="pointer-events-none absolute -top-2.5 left-4 right-4 flex items-center justify-between z-20">
                  {[0, 1, 2, 3, 4, 5, 6].map((ringIdx) => (
                    <div key={ringIdx} className="flex flex-col items-center">
                      <div
                        className="w-2 h-4 rounded-full"
                        style={{
                          background:
                            "linear-gradient(90deg, #18181b 0%, #f4f4f5 48%, #3f3f46 88%, #09090b 100%)",
                          boxShadow: "0 2px 4px rgba(0,0,0,0.65)",
                        }}
                      />
                      <div className="w-2 h-1.5 rounded-full bg-black/75 -mt-0.5" />
                    </div>
                  ))}
                </div>

                {/* Stitched Leatherette Notepad Header Bar (Drag Handle) */}
                <div
                  onPointerDown={(e) =>
                    handlePointerDownItem(e, "note", note.id, note.x, note.y)
                  }
                  className="px-3.5 pt-3 pb-2 flex items-center justify-between border-b-2 border-[#7f1d1d]/60 rounded-t-[10px] cursor-move"
                  style={{
                    background:
                      "linear-gradient(180deg, #27272a 0%, #14131a 75%, #2d1215 100%)",
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]" />
                    <span className="mono-meta text-[9px] uppercase tracking-wider text-[#edeae4] font-semibold">
                      {palette.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => handleCycleNoteColor(note.id, note.color)}
                      title="Change notepad sheet color"
                      className="w-5 h-5 rounded-full border border-white/25 flex items-center justify-center text-[9px] cursor-pointer bg-white/15 hover:bg-white/30 text-white"
                    >
                      🎨
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => handleDeleteNote(note.id)}
                      title="Tear off notepad sheet"
                      className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center text-xs cursor-pointer bg-white/15 hover:bg-red-500/80 text-white"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {/* Ruled Legal Notepad Body with Double Red Margin Line & Horizontal Rules */}
                <div
                  className="relative pl-8 pr-3 py-2.5"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(180deg, transparent 0px, transparent 23px, rgba(59, 130, 246, 0.24) 23px, rgba(59, 130, 246, 0.24) 24px)",
                    backgroundPositionY: "6px",
                  }}
                >
                  {/* Double Red Vertical Margin Rule */}
                  <div className="pointer-events-none absolute top-0 bottom-0 left-5 w-[1.5px] bg-red-500/45" />
                  <div className="pointer-events-none absolute top-0 bottom-0 left-[23px] w-[0.5px] bg-red-500/30" />

                  <textarea
                    value={note.text}
                    onChange={(e) => handleUpdateNoteText(note.id, e.target.value)}
                    rows={4}
                    className="w-full bg-transparent resize-none border-0 focus:outline-none text-xs sm:text-[13px] font-medium text-[#16132b] leading-[24px]"
                  />
                </div>

                {/* Notepad Sheet Footer: Author & Timestamp */}
                <div className="relative pl-8 pr-3 py-2 border-t border-black/10 flex items-center justify-between text-[10px]">
                  <div className="pointer-events-none absolute top-0 bottom-0 left-5 w-[1.5px] bg-red-500/45" />
                  <div className="flex items-center gap-1.5">
                    <UserAvatarBadge byName={note.author} sizeClass="w-4 h-4 text-[8px]" />
                    <span className="mono-meta text-[9px] uppercase text-[#16132b]/80 font-semibold">
                      {note.author}
                    </span>
                  </div>
                  <span className="mono-meta text-[9px] text-[#16132b]/60">
                    {note.createdAt}
                  </span>
                </div>
              </div>
            );
          })}

          {/* 2. PINNED SONG / AUDIO FILE CARDS WITH COMMENT THREADS */}
          {boardState.fileNodes.map((node) => {
            const isPlaying = playingFileId === node.fileId;
            const { cleanTitle, ext } = parseStudioFileDisplay(node.fileName);

            return (
              <div
                key={node.id}
                data-board-card="true"
                style={{
                  position: "absolute",
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: "356px",
                }}
                className={`file-card ${
                  isPlaying ? "file-card-playing" : ""
                } rounded-2xl overflow-hidden flex flex-col shadow-xl`}
              >
                {/* Drag Handle Header */}
                <div
                  onPointerDown={(e) =>
                    handlePointerDownItem(e, "file", node.id, node.x, node.y)
                  }
                  className="px-3.5 py-2 bg-[var(--card-deep)] border-b border-[var(--hair)] flex items-center justify-between cursor-move"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: accentTheme.accentPrimary }}
                    />
                    <span className="mono-meta text-[9px] uppercase text-[var(--ink)] font-semibold">
                      Pinned Track · Drag to Move
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="mono-meta text-[9px] uppercase px-1.5 py-0.5 rounded bg-[var(--bg)] text-[var(--ink)]">
                      {ext} · {formatBytes(node.fileSize)}
                    </span>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => handleDeleteFileNode(node.id)}
                      title="Remove from board"
                      className="w-5 h-5 rounded-full bg-[var(--bg)] border border-[var(--hair)] flex items-center justify-center text-xs cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {/* Song Player & Waveform Strip */}
                <div className="p-3.5 flex items-center gap-3 border-b border-[var(--hair)] bg-[#f4f1eb]">
                  <button
                    type="button"
                    onClick={() =>
                      onTogglePlayFile(node.fileId, node.fileName, node.fileSize)
                    }
                    className={`w-11 h-11 rounded-2xl flex flex-col items-center justify-center shrink-0 cursor-pointer transition border ${
                      isPlaying
                        ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                        : "bg-[var(--card)] text-[var(--ink)] border-[var(--ink)]/15 hover:bg-[var(--ink)] hover:text-[var(--bg)]"
                    }`}
                  >
                    {isPlaying ? (
                      <StudioIcon name="pause" className="w-4 h-4" />
                    ) : (
                      <StudioIcon name="play" className="w-3.5 h-3.5 ml-0.5" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="file-title-font text-sm text-[var(--ink)] truncate">
                      {cleanTitle}
                    </div>
                    <div className="mono-meta text-[9px] text-[var(--ink-soft)] truncate">
                      {node.fileName}
                    </div>
                    {/* Mini Waveform Scrub Bars */}
                    <div className="flex items-center gap-0.5 h-4 mt-1.5">
                      {MINI_WAVE.map((h, i) => {
                        const active =
                          isPlaying && (i / MINI_WAVE.length) * 100 <= playProgress;
                        return (
                          <span
                            key={i}
                            className="flex-1 rounded-full"
                            style={{
                              height: `${Math.max(3, Math.round(h * 0.15))}px`,
                              background: active
                                ? accentTheme.accentPrimary
                                : "rgba(22,19,43,0.25)",
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <UserAvatarBadge byName={node.addedBy} sizeClass="w-6 h-6 text-[9px]" />
                </div>

                {/* Collaborator Comments Thread on the Song */}
                <div className="p-3 bg-[var(--bg)] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="mono-meta text-[9px] uppercase text-[var(--ink-soft)]">
                      Track Comments ({node.comments.length})
                    </span>
                  </div>

                  {node.comments.length === 0 ? (
                    <div className="text-[11px] text-[var(--ink-soft)] italic py-1">
                      No comments yet — drop a timestamp or mix note below.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {node.comments.map((c) => (
                        <div
                          key={c.id}
                          className="p-2 rounded-xl bg-[var(--card)] border border-[var(--hair)] text-xs"
                        >
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <div className="flex items-center gap-1.5">
                              <UserAvatarBadge
                                byName={c.author}
                                sizeClass="w-4 h-4 text-[8px]"
                              />
                              <span className="font-semibold text-[11px] text-[var(--ink)]">
                                {c.author}
                              </span>
                              {c.timestampTag && (
                                <span
                                  className="mono-meta text-[9px] px-1.5 py-0.2 rounded font-semibold"
                                  style={{
                                    background: `${accentTheme.accentPrimary}22`,
                                    color: "var(--ink)",
                                  }}
                                >
                                  @{c.timestampTag}
                                </span>
                              )}
                            </div>
                            <span className="mono-meta text-[8px] text-[var(--ink-soft)]">
                              {c.createdAt}
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--ink)] pl-5 leading-snug">
                            {c.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Comment Input Row */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <input
                      type="text"
                      value={timestampDrafts[node.id] ?? ""}
                      onChange={(e) =>
                        setTimestampDrafts((p) => ({ ...p, [node.id]: e.target.value }))
                      }
                      placeholder="0:24"
                      className="w-12 px-2 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--hair)] mono-meta text-[10px] text-[var(--ink)] focus:outline-none focus:border-[var(--ink)]"
                      title="Optional timestamp (e.g. 0:24)"
                    />
                    <input
                      type="text"
                      value={commentDrafts[node.id] ?? ""}
                      onChange={(e) =>
                        setCommentDrafts((p) => ({ ...p, [node.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddFileComment(node.id);
                      }}
                      placeholder="Comment on song..."
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--hair)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)]"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddFileComment(node.id)}
                      title="Post comment"
                      className="icon-btn icon-btn-active w-7 h-7 shrink-0"
                    >
                      <StudioIcon name="send" className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Floating Bottom-Center Figma Creation Dock */}
        <div
          data-board-card="true"
          className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-1.5rem)] sm:w-auto px-3 py-2 rounded-2xl bg-[#16132b]/95 text-[#edeae4] border border-white/15 shadow-2xl flex flex-wrap items-center justify-center gap-2"
        >
          {/* Sticky Color Swatches + Add Sticky Button */}
          <div className="flex items-center gap-1 pr-2 border-r border-white/15">
            {COLOR_ORDER.map((cKey) => (
              <button
                key={cKey}
                type="button"
                onClick={() => {
                  setSelectedStickyColor(cKey);
                  handleAddStickyNote(cKey);
                }}
                title={`Drop ${STICKY_NOTE_COLORS[cKey].label} Sticky`}
                className={`w-5 h-5 rounded-full cursor-pointer transition border ${
                  selectedStickyColor === cKey
                    ? "scale-110 ring-2 ring-white"
                    : "opacity-80 hover:opacity-100"
                }`}
                style={{ background: STICKY_NOTE_COLORS[cKey].bg }}
              />
            ))}
            <button
              type="button"
              onClick={() => handleAddStickyNote(selectedStickyColor)}
              className="ml-1.5 px-3 py-1.5 rounded-xl bg-[#fef08a] text-[#16132b] mono-meta text-[10px] uppercase font-semibold cursor-pointer hover:opacity-95 transition"
            >
              + Sticky Note
            </button>
          </div>

          {/* Drop Existing Vault Song onto Board */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setTrackPickerOpen((v) => !v)}
              className="px-3 py-1.5 rounded-xl bg-white/12 hover:bg-white/20 text-[#edeae4] mono-meta text-[10px] uppercase cursor-pointer transition flex items-center gap-1.5"
            >
              <span>+ Pin Vault Song</span>
            </button>

            {trackPickerOpen && (
              <div className="absolute bottom-11 left-0 w-64 rounded-2xl bg-[#edeae4] text-[#16132b] border border-[var(--ink)]/20 shadow-2xl p-2 space-y-1 z-30">
                <div className="px-2 py-1 mono-meta text-[9px] uppercase text-[var(--ink-soft)] flex items-center justify-between">
                  <span>Pin Track to Vision Board</span>
                  <button
                    type="button"
                    onClick={() => setTrackPickerOpen(false)}
                    className="text-xs cursor-pointer"
                  >
                    ×
                  </button>
                </div>
                <div className="max-h-44 overflow-y-auto space-y-1">
                  {vaultFiles.map((vf) => (
                    <button
                      key={vf.id}
                      type="button"
                      onClick={() => handlePinVaultFile(vf)}
                      className="w-full px-2.5 py-1.5 rounded-xl hover:bg-black/5 text-left flex items-center justify-between gap-2 text-xs cursor-pointer"
                    >
                      <span className="file-title-font text-[11px] truncate">
                        {vf.name}
                      </span>
                      <span className="mono-meta text-[9px] text-[var(--ink-soft)] shrink-0">
                        {formatBytes(vf.size)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Upload New Song Directly to Vision Board */}
          <button
            type="button"
            onClick={onUploadSongToBoard}
            className="px-3 py-1.5 rounded-xl bg-white text-[#16132b] mono-meta text-[10px] uppercase font-semibold cursor-pointer hover:opacity-90 transition flex items-center gap-1.5"
          >
            <StudioIcon name="upload" className="w-3.5 h-3.5" />
            <span>Upload Song</span>
          </button>
        </div>
      </div>
    </section>
  );
}
