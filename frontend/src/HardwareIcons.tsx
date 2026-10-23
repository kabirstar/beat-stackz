import type { CSSProperties, ReactNode } from "react";
import type { HardwareThemeSlot } from "./vaultTheme.ts";

export function UserAvatarBadge({
  byName,
  sizeClass = "w-5 h-5 text-[9px]",
}: {
  byName: string;
  sizeClass?: string;
}) {
  const isTodo = (byName || "").toLowerCase() === "todo";
  return (
    <span
      title={`Added by ${isTodo ? "Todo" : "Swish"}`}
      className={`${sizeClass} rounded-full inline-flex items-center justify-center font-semibold shrink-0`}
      style={
        isTodo
          ? {
              background: "#111114",
              color: "#fafafa",
              border: "1.5px solid #e4e4e7",
            }
          : {
              background: "#0b0a0c",
              color: "#ef4444",
              border: "1.5px solid #dc2626",
            }
      }
    >
      {isTodo ? "T" : "S"}
    </span>
  );
}

export function MiniFolderSvg({ iconKey }: { iconKey: string }) {
  switch (iconKey) {
    case "beats":
      return (
        <svg
          className="w-4 h-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "presets":
    case "sub_plugin":
    case "sub_preamp":
      return (
        <svg
          className="w-4 h-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <line x1="4" y1="21" x2="4" y2="14" />
          <line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" />
          <line x1="20" y1="12" x2="20" y2="3" />
          <circle cx="4" cy="12" r="2" />
          <circle cx="12" cy="10" r="2" />
          <circle cx="20" cy="14" r="2" />
        </svg>
      );
    case "vocals":
    case "sub_adlib":
    case "sub_bg":
      return (
        <svg
          className="w-4 h-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      );
    case "songs":
    case "sub_mix":
    case "sub_drop":
      return (
        <svg
          className="w-4 h-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    case "vision_board":
      return (
        <svg
          className="w-4 h-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="4" width="8" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="8" rx="1.5" />
          <path d="M14 15h6M14 18h4" />
        </svg>
      );
    case "media":
    case "sub_video":
    case "sub_mv":
    case "sub_covers":
    default:
      return (
        <svg
          className="w-4 h-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
      );
  }
}

function InHardwareBox({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="hw-layer-back" />
      <div className="hw-layer-mid" />
      <div className="hw-chassis">{children}</div>
    </>
  );
}

export function HardwareObject3D({
  iconKey,
  code,
}: {
  iconKey: string;
  code: string;
}) {
  switch (iconKey) {
    case "vision_board":
      return (
        <InHardwareBox>
          <div
            className="flex items-center justify-between mb-1 px-1 py-0.5 rounded-xs border border-white/10"
            style={{
              background: "var(--chassis-edge)",
              transform: "translateZ(6px)",
            }}
          >
            <span
              className="mono-meta text-[5.5px] uppercase tracking-widest"
              style={{ color: "var(--stamp-color)" }}
            >
              {code} · VISION
            </span>
            <span
              className="w-2 h-2 rounded-full rec-dot"
              style={{ background: "var(--accent-primary)" }}
            />
          </div>

          <div
            className="relative flex-1 w-full rounded-lg border border-white/15 p-1.5 overflow-visible"
            style={{
              background:
                "radial-gradient(circle, rgba(255,255,255,0.22) 1px, transparent 1px) 0 0 / 6px 6px, var(--chassis-mid)",
              transformStyle: "preserve-3d",
            }}
          >
            {/* Floating Yellow Sticky Note (Top-Left) */}
            <div
              className="mic-capsule-3d absolute top-1 left-1 w-8 h-8 rounded-xs p-1 flex flex-col justify-between border border-black/20"
              style={{
                background: "#fef08a",
                transform: "translateZ(14px) rotateZ(-6deg)",
                boxShadow: "-3px 5px 0 rgba(0,0,0,0.45)",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 mx-auto -mt-0.5" />
              <div className="w-full h-0.5 bg-black/45 rounded-full" />
              <div className="w-3/4 h-0.5 bg-black/35 rounded-full" />
              <span className="mono-meta text-[4.5px] text-black/75 font-bold">HOOK</span>
            </div>

            {/* Floating Coral Sticky Note (Top-Right) */}
            <div
              className="mic-capsule-3d absolute top-1.5 right-1 w-7 h-7 rounded-xs p-1 flex flex-col justify-between border border-black/20"
              style={{
                background: "#fecdd3",
                animationDelay: "-0.9s",
                transform: "translateZ(11px) rotateZ(7deg)",
                boxShadow: "-3px 5px 0 rgba(0,0,0,0.4)",
              }}
            >
              <div className="w-full h-0.5 bg-black/45 rounded-full" />
              <div className="w-2/3 h-0.5 bg-black/35 rounded-full" />
              <span className="mono-meta text-[4.5px] text-black/75 font-bold">808</span>
            </div>

            {/* Pinned Song / Waveform Card (Bottom-Center) */}
            <div
              className=" absolute bottom-1 left-1.5 right-1.5 h-6 rounded-sm px-1.5 py-0.5 flex items-center justify-between border"
              style={{
                background: "var(--chassis-bg)",
                borderColor: "var(--accent-primary)",
                transform: "translateZ(16px)",
                boxShadow: "-3px 5px 0 var(--chassis-edge)",
              }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex items-center justify-center text-[5px]"
                style={{
                  background: "var(--accent-primary)",
                  color: "var(--knob-ink)",
                }}
              >
                ▶
              </span>
              <div className="flex items-end gap-0.5 h-2.5">
                <span className="w-0.5 h-1.5 bg-white/80" />
                <span
                  className="w-0.5 h-2.5"
                  style={{ background: "var(--accent-primary)" }}
                />
                <span className="w-0.5 h-1 bg-white/70" />
                <span
                  className="w-0.5 h-2"
                  style={{ background: "var(--accent-secondary)" }}
                />
                <span className="w-0.5 h-1.5 bg-white/80" />
              </div>
              <span
                className="mono-meta text-[4.5px]"
                style={{ color: "var(--stamp-color)" }}
              >
                +3💬
              </span>
            </div>
          </div>
        </InHardwareBox>
      );
    case "beats": {
      const padDelays = [
        0, 0.3, 0.7, 1.1, 0.5, 0.15, 0.95, 0.4, 1.3, 0.6, 0.2, 0.85, 0.45, 1.05,
        0.25, 0.75,
      ];
      return (
        <InHardwareBox>
          <div
            className="flex items-center justify-between mb-1.5 px-1 py-0.5 rounded-xs border border-white/10"
            style={{
              background: "var(--chassis-edge)",
              transform: "translateZ(5px)",
            }}
          >
            <span
              className="mono-meta text-[6px] uppercase tracking-widest"
              style={{ color: "var(--stamp-color)" }}
            >
              {code} · MPC
            </span>
            <span
              className="w-3 h-1.5 rounded-xs rec-dot"
              style={{ background: "var(--accent-primary)" }}
            />
          </div>
          <div
            className="grid grid-cols-4 gap-1.5 flex-1"
            style={{ transformStyle: "preserve-3d" }}
          >
            {padDelays.map((d, i) => (
              <div
                key={i}
                className="mpc-pad"
                style={{ "--pad-delay": `-${d}s` } as CSSProperties}
              />
            ))}
          </div>
        </InHardwareBox>
      );
    }

    case "presets":
      return (
        <InHardwareBox>
          <div className="flex items-center justify-between mb-1 px-0.5">
            <span
              className="mono-meta text-[6.5px] uppercase"
              style={{ color: "var(--stamp-color)" }}
            >
              {code} · SYNTH
            </span>
            <span
              className="w-1.5 h-1.5 rounded-full rec-dot"
              style={{ background: "var(--accent-primary)" }}
            />
          </div>
          <div
            className="flex items-center justify-around py-1"
            style={{ transformStyle: "preserve-3d" }}
          >
            <div
              className="rotary-knob"
              style={{ "--knob-delay": "0s" } as CSSProperties}
            />
            <div
              className="rotary-knob"
              style={
                {
                  "--knob-delay": "-1.4s",
                  background: "var(--accent-primary)",
                } as CSSProperties
              }
            />
          </div>
          <div
            className="flex items-center justify-around flex-1 pt-2 px-2"
            style={{ transformStyle: "preserve-3d" }}
          >
            {[0, -0.9, -1.8].map((d, i) => (
              <div
                key={i}
                className="relative w-1 h-full rounded-full"
                style={{
                  background: "var(--pad-idle)",
                  transformStyle: "preserve-3d",
                }}
              >
                <div
                  className="fader-cap"
                  style={{ "--fader-delay": `${d}s` } as CSSProperties}
                />
              </div>
            ))}
          </div>
        </InHardwareBox>
      );

    case "sub_plugin":
      return (
        <div
          className="w-full h-full flex flex-col items-center justify-center relative"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div
            className="flex items-center gap-5 -mb-1 z-10"
            style={{ transform: "translateZ(4px)" }}
          >
            <div
              className="w-3 h-2.5 rounded-t-xs border border-white/25"
              style={{ background: "var(--accent-secondary)" }}
            />
            <div
              className="w-3 h-2.5 rounded-t-xs border border-white/25"
              style={{ background: "var(--accent-secondary)" }}
            />
          </div>
          <div
            className="w-[68%] h-[82%] rounded-xl p-2.5 flex flex-col items-center justify-between relative"
            style={{
              background: "var(--chassis-bg)",
              border: "1.5px solid var(--chassis-border)",
              borderLeft: "3px solid var(--accent-primary)",
              boxShadow:
                "-7px 11px 0 var(--chassis-edge), -10px 18px 24px rgba(16,13,10,0.34)",
              transformStyle: "preserve-3d",
            }}
          >
            <div className="w-full flex items-center justify-between">
              <span
                className="mono-meta text-[6px] uppercase"
                style={{ color: "var(--stamp-color)" }}
              >
                DSP · FX
              </span>
              <span
                className="w-2 h-2 rounded-full rec-dot"
                style={{
                  background: "var(--accent-primary)",
                  boxShadow: "0 0 8px var(--accent-primary)",
                }}
              />
            </div>
            <div
              className="rotary-knob"
              style={
                {
                  "--knob-delay": "-0.4s",
                  background: "var(--accent-primary)",
                } as CSSProperties
              }
            />
            <div
              className="w-full py-1 rounded-md border border-white/20 flex items-center justify-center"
              style={{
                background: "var(--chassis-mid)",
                transform: "translateZ(8px)",
                boxShadow: "-2px 3px 0 var(--chassis-edge)",
              }}
            >
              <div
                className="w-3.5 h-3.5 rounded-full border-2"
                style={{
                  background: "var(--accent-secondary)",
                  borderColor: "var(--chassis-edge)",
                }}
              />
            </div>
          </div>
        </div>
      );

    case "sub_preamp":
      return (
        <div
          className="w-full h-full flex flex-col items-center justify-center relative"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div
            className="flex items-end justify-center gap-3 -mb-1 z-10"
            style={{ transform: "translateZ(8px)" }}
          >
            {[0, 1].map((i) => (
              <div
                key={i}
                className="w-4 h-6 rounded-t-full border border-white/30 flex flex-col items-center justify-end p-0.5"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.18), var(--chassis-mid))",
                  boxShadow: "0 0 10px var(--accent-primary)",
                }}
              >
                <div
                  className="w-1.5 h-3 rounded-full rec-dot"
                  style={{ background: "var(--accent-primary)" }}
                />
              </div>
            ))}
          </div>
          <div
            className="w-[86%] h-[68%] rounded-xl p-2.5 flex flex-col justify-between"
            style={{
              background: "var(--chassis-bg)",
              border: "1.5px solid var(--chassis-border)",
              borderLeft: "3px solid var(--accent-primary)",
              boxShadow:
                "-7px 10px 0 var(--chassis-edge), -12px 18px 24px rgba(16,13,10,0.34)",
              transformStyle: "preserve-3d",
            }}
          >
            <div
              className="flex-1 rounded border border-white/20 relative overflow-hidden flex items-end justify-center p-1"
              style={{
                background: "var(--chassis-mid)",
                transform: "translateZ(7px)",
              }}
            >
              <div
                className="w-4/5 h-3/5 border-t-2 border-dashed rounded-t-full opacity-55"
                style={{ borderColor: "var(--stamp-color)" }}
              />
              <div
                className="vu-needle-3d absolute bottom-1 w-0.5 h-3/4 rounded-full"
                style={{ background: "var(--accent-primary)" }}
              />
            </div>
            <div
              className="flex items-center justify-between pt-1.5 px-1"
              style={{ transform: "translateZ(6px)" }}
            >
              <span
                className="mono-meta text-[6px] uppercase"
                style={{ color: "var(--stamp-color)" }}
              >
                TUBE · VU
              </span>
              <div className="flex gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: "var(--accent-primary)" }}
                />
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: "var(--accent-secondary)" }}
                />
              </div>
            </div>
          </div>
        </div>
      );

    case "vocals":
    case "sub_adlib":
      return (
        <div
          className="w-full h-full flex items-center justify-center relative"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div
            className="sonic-ring"
            style={{ "--ring-delay": "0s" } as CSSProperties}
          />
          <div
            className="sonic-ring"
            style={{ "--ring-delay": "-1.2s" } as CSSProperties}
          />

          <div
            className="mic-capsule-3d flex flex-col items-center relative"
            style={{ transformStyle: "preserve-3d" }}
          >
            {/* Flat-Topped Aston Spirit Cap */}
            <div
              className="w-11 sm:w-12 h-2 rounded-t-md border-x-2 border-t-2"
              style={{
                background: "var(--accent-primary)",
                borderColor: "var(--chassis-edge)",
                transform: "translateZ(15px)",
                boxShadow: "-4px 3px 0 var(--chassis-edge)",
              }}
            />

            {/* Aston Spirit Open Wave-Spring Head Basket + Glowing Internal Capsule */}
            <div
              className="w-11 sm:w-12 h-11 sm:h-12 border-x-2 flex items-center justify-center relative overflow-hidden"
              style={{
                background: "var(--chassis-mid)",
                borderColor: "var(--accent-primary)",
                transform: "translateZ(14px)",
                boxShadow: "-6px 7px 0 var(--chassis-edge)",
              }}
            >
              <div
                className="w-5 h-5 rounded-full rec-dot"
                style={{
                  background: "var(--accent-primary)",
                  opacity: 0.9,
                  boxShadow: "0 0 12px var(--accent-primary)",
                }}
              />
              <svg
                viewBox="0 0 48 48"
                className="absolute inset-0 w-full h-full pointer-events-none"
              >
                <g
                  fill="none"
                  stroke="var(--accent-primary)"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M9 0 C6 12 12 24 8 36 C6 42 9 46 9 48" />
                  <path d="M19 0 C16 12 22 24 18 36 C16 42 19 46 19 48" />
                  <path d="M29 0 C32 12 26 24 30 36 C32 42 29 46 29 48" />
                  <path d="M39 0 C42 12 36 24 40 36 C42 42 39 46 39 48" />
                </g>
              </svg>
            </div>

            {/* Flush Beveled Collar Ring */}
            <div
              className="w-11 sm:w-12 h-1.5 border-x-2 border-y"
              style={{
                background: "var(--accent-primary)",
                borderColor: "var(--chassis-edge)",
                transform: "translateZ(16px)",
                boxShadow: "-4px 3px 0 var(--chassis-edge)",
              }}
            />

            {/* Flush-Diameter Aston Spirit Cylindrical Body (3 Top Switches + Diamond Emblem) */}
            <div
              className="w-11 sm:w-12 h-12 sm:h-13 rounded-b-lg border-x-2 border-b-2 flex flex-col items-center justify-between py-1.5 px-1.5 relative"
              style={{
                background: "var(--chassis-bg)",
                borderColor: "var(--chassis-border)",
                borderLeft: "3px solid var(--accent-primary)",
                transform: "translateZ(12px)",
                boxShadow:
                  "-6px 9px 0 var(--chassis-edge), -10px 16px 22px rgba(16,13,10,0.34)",
              }}
            >
              <div className="w-full flex items-center justify-evenly">
                <span
                  className="w-2 h-1 rounded-xs"
                  style={{ background: "var(--accent-primary)" }}
                />
                <span
                  className="w-2 h-1 rounded-xs"
                  style={{ background: "var(--stamp-color)" }}
                />
                <span
                  className="w-2 h-1 rounded-xs"
                  style={{ background: "var(--accent-primary)" }}
                />
              </div>
              <div
                className="w-2.5 h-2.5 rotate-45 rounded-[2px] border"
                style={{
                  background: "var(--accent-primary)",
                  borderColor: "var(--chassis-edge)",
                }}
              />
              <span
                className="mono-meta text-[5px] uppercase tracking-widest"
                style={{ color: "var(--stamp-color)" }}
              >
                {code}
              </span>
            </div>

            {/* Stepped Aston Moulded End Cap & XLR Base */}
            <div
              className="w-7 h-2.5 rounded-b-md border-x-2 border-b-2"
              style={{
                background: "var(--chassis-mid)",
                borderColor: "var(--chassis-edge)",
                transform: "translateZ(9px)",
                boxShadow: "-4px 5px 0 var(--chassis-edge)",
              }}
            />
          </div>
        </div>
      );

    case "sub_bg":
      return (
        <div
          className="w-full h-full flex items-center justify-center relative"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div
            className="sonic-ring"
            style={{ "--ring-delay": "-0.6s" } as CSSProperties}
          />
          <div
            className="flex items-end justify-center gap-2.5"
            style={{ transformStyle: "preserve-3d" }}
          >
            {[
              { delay: "0s", h: "h-9", headH: "h-8", z: "8px", primary: false },
              {
                delay: "-0.6s",
                h: "h-12",
                headH: "h-10",
                z: "16px",
                primary: true,
              },
              {
                delay: "-1.2s",
                h: "h-9",
                headH: "h-8",
                z: "8px",
                primary: false,
              },
            ].map((m, idx) => (
              <div
                key={idx}
                className="mic-capsule-3d flex flex-col items-center"
                style={{
                  animationDelay: m.delay,
                  transform: `translateZ(${m.z})`,
                  transformStyle: "preserve-3d",
                }}
              >
                <div
                  className={`w-7 ${m.headH} rounded-t-full rounded-b-sm border-2 flex flex-col justify-evenly px-1`}
                  style={{
                    background: m.primary
                      ? "var(--accent-primary)"
                      : "var(--chassis-mid)",
                    borderColor: m.primary
                      ? "var(--chassis-edge)"
                      : "var(--accent-primary)",
                    boxShadow: "-4px 6px 0 var(--chassis-edge)",
                  }}
                >
                  <div className="w-full h-px bg-black/35" />
                  <div className="w-full h-px bg-black/35" />
                </div>
                <div
                  className={`w-4 ${m.h} rounded-b-lg border-x border-b`}
                  style={{
                    background: "var(--chassis-bg)",
                    borderColor: "var(--chassis-border)",
                    boxShadow: "-4px 6px 0 var(--chassis-edge)",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      );

    case "songs":
    case "sub_drop":
      return (
        <div
          className="w-full h-full flex flex-col items-center justify-center relative"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div
            className="w-full flex items-center justify-center gap-2 sm:gap-2.5 -mb-3 z-10"
            style={{ transformStyle: "preserve-3d" }}
          >
            {[0, 1].map((i) => (
              <div
                key={i}
                className="tape-reel-3d w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center relative"
                style={{
                  background: "var(--chassis-bg)",
                  border: "2.5px solid var(--accent-primary)",
                  boxShadow:
                    "-5px 8px 0 var(--chassis-edge), -8px 14px 20px rgba(16,13,10,0.34)",
                }}
              >
                <div
                  className="w-10 h-10 rounded-full border border-white/15 flex items-center justify-center"
                  style={{ background: "var(--chassis-mid)" }}
                >
                  <div
                    className="w-3.5 h-3.5 rounded-full"
                    style={{ background: "var(--accent-primary)" }}
                  />
                </div>
                <div
                  className="absolute w-full h-0.5"
                  style={{ background: "var(--accent-primary)" }}
                />
                <div
                  className="absolute h-full w-0.5"
                  style={{ background: "var(--accent-primary)" }}
                />
              </div>
            ))}
          </div>

          <div
            className="w-[84%] h-11 rounded-xl px-2.5 py-1.5 flex flex-col justify-between relative"
            style={{
              background: "var(--chassis-bg)",
              border: "1.5px solid var(--chassis-border)",
              borderLeft: "3px solid var(--accent-primary)",
              transform: "translateZ(12px)",
              boxShadow:
                "-6px 9px 0 var(--chassis-edge), -10px 16px 22px rgba(16,13,10,0.35)",
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="mono-meta text-[6px] uppercase"
                style={{ color: "var(--stamp-color)" }}
              >
                {code} · 30 IPS
              </span>
              <span
                className="w-1.5 h-1.5 rounded-full rec-dot"
                style={{ background: "var(--accent-primary)" }}
              />
            </div>
            <div
              className="h-3 rounded-xs flex items-center justify-center"
              style={{ background: "var(--accent-primary)" }}
            >
              <span
                className="mono-meta text-[5.5px] uppercase font-bold"
                style={{ color: "var(--knob-ink)" }}
              >
                MASTER REEL
              </span>
            </div>
          </div>
        </div>
      );

    case "sub_mix":
      return (
        <InHardwareBox>
          <div className="flex items-center justify-between mb-1">
            <span
              className="mono-meta text-[6.5px] uppercase"
              style={{ color: "var(--stamp-color)" }}
            >
              MIX · BUS
            </span>
            <span
              className="w-2 h-1.5 rounded-xs"
              style={{ background: "var(--accent-primary)" }}
            />
          </div>
          <div
            className="flex-1 flex items-center justify-around px-1 py-1"
            style={{ transformStyle: "preserve-3d" }}
          >
            {[0, -0.7, -1.4, -2.1].map((d, idx) => (
              <div
                key={idx}
                className="relative w-1.5 h-full rounded-full"
                style={{
                  background: "var(--pad-idle)",
                  transformStyle: "preserve-3d",
                }}
              >
                <div
                  className="fader-cap"
                  style={
                    {
                      "--fader-delay": `${d}s`,
                      background:
                        idx % 2 === 0
                          ? "var(--accent-primary)"
                          : "var(--accent-secondary)",
                    } as CSSProperties
                  }
                />
              </div>
            ))}
          </div>
        </InHardwareBox>
      );

    case "sub_mv":
      return (
        <div
          className="w-full h-full flex flex-col items-center justify-center px-2"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div
            className="clapper-bar-3d h-4 w-[90%] rounded-t-md mb-1 border-2"
            style={{
              background:
                "repeating-linear-gradient(125deg, var(--accent-primary) 0px, var(--accent-primary) 7px, var(--chassis-bg) 7px, var(--chassis-bg) 14px)",
              borderColor: "var(--chassis-edge)",
              boxShadow: "-5px 6px 0 var(--chassis-edge)",
            }}
          />
          <div
            className="w-[90%] h-[62%] rounded-b-xl border-2 p-2.5 flex flex-col justify-between"
            style={{
              background: "var(--chassis-bg)",
              borderColor: "var(--chassis-border)",
              borderLeft: "3px solid var(--accent-primary)",
              transform: "translateZ(10px)",
              boxShadow:
                "-7px 10px 0 var(--chassis-edge), -12px 18px 24px rgba(16,13,10,0.34)",
            }}
          >
            <div className="flex justify-between items-center">
              <span
                className="mono-meta text-[6px]"
                style={{ color: "var(--stamp-color)" }}
              >
                SCENE 01
              </span>
              <span
                className="w-2 h-2 rounded-full rec-dot"
                style={{ background: "var(--accent-primary)" }}
              />
            </div>
            <div className="h-px w-full bg-white/15" />
            <div className="flex justify-between items-center">
              <span
                className="mono-meta text-[6.5px] uppercase font-semibold"
                style={{ color: "var(--accent-primary)" }}
              >
                TAKE 04
              </span>
              <span
                className="mono-meta text-[5.5px]"
                style={{ color: "var(--stamp-color)" }}
              >
                4K RAW
              </span>
            </div>
          </div>
        </div>
      );

    case "sub_covers":
      return (
        <div
          className="w-full h-full flex items-center justify-center relative"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div
            className="tape-reel-3d w-20 h-20 rounded-full absolute right-1 flex items-center justify-center"
            style={{
              background: "var(--chassis-edge)",
              border: "2px solid var(--accent-primary)",
              transform: "translateZ(4px)",
            }}
          >
            <div
              className="w-7 h-7 rounded-full border"
              style={{
                background: "var(--accent-primary)",
                borderColor: "var(--chassis-bg)",
              }}
            />
          </div>
          <div
            className="w-20 h-20 rounded-lg border-2 p-2 flex flex-col justify-between relative -left-2"
            style={{
              background: "var(--chassis-bg)",
              borderColor: "var(--accent-primary)",
              transform: "translateZ(14px) rotateZ(-5deg)",
              boxShadow:
                "-6px 9px 0 var(--chassis-edge), -10px 16px 22px rgba(16,13,10,0.35)",
            }}
          >
            <span
              className="mono-meta text-[5.5px] uppercase"
              style={{ color: "var(--stamp-color)" }}
            >
              ART · 01
            </span>
            <div
              className="w-9 h-9 rounded-full mx-auto border-2 flex items-center justify-center"
              style={{
                background: "var(--accent-primary)",
                borderColor: "var(--chassis-edge)",
              }}
            >
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: "var(--chassis-bg)" }}
              />
            </div>
            <div
              className="h-1 w-2/3 rounded-full"
              style={{ background: "var(--stamp-color)" }}
            />
          </div>
        </div>
      );

    case "rap_cup":
      return (
        <div
          className="w-full h-full flex items-center justify-center relative"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div
            className="lean-cup-3d w-full h-full relative flex items-center justify-center"
            style={{ transformStyle: "preserve-3d" }}
          >
            {/* Back 3D Volumetric Shadow / Extrusion Silhouette */}
            <svg
              viewBox="0 0 120 120"
              className="w-full h-full absolute inset-0 pointer-events-none"
              style={{
                transform: "translateZ(-7px) translateX(-4px) translateY(5px)",
                filter: "drop-shadow(-6px 10px 14px rgba(18,12,28,0.45))",
              }}
            >
              <path
                d="M30 28 L90 28 L80 94 C79 98 75 101 70 101 L50 101 C45 101 41 98 40 94 Z"
                fill="#1e1b2e"
              />
              <path
                d="M33 84 L87 84 L82 108 C81 112 76 114 70 114 L50 114 C44 114 39 112 38 108 Z"
                fill="#141122"
              />
              <ellipse cx="60" cy="28" rx="33" ry="9" fill="#1e1b2e" />
            </svg>

            {/* Main Sculpted 3D Double Styrofoam Cup Body */}
            <svg
              viewBox="0 0 120 120"
              className="w-full h-full absolute inset-0"
              style={{ transform: "translateZ(6px)" }}
            >
              <defs>
                <linearGradient id="cupFoamGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#e2e8f0" />
                  <stop offset="28%" stopColor="#ffffff" />
                  <stop offset="68%" stopColor="#f1f5f9" />
                  <stop offset="100%" stopColor="#94a3b8" />
                </linearGradient>
                <linearGradient id="cupOuterGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#cbd5e1" />
                  <stop offset="30%" stopColor="#f8fafc" />
                  <stop offset="70%" stopColor="#e2e8f0" />
                  <stop offset="100%" stopColor="#64748b" />
                </linearGradient>
              </defs>

              <path
                d="M35 76 L85 76 L81 105 C80 110 73 113 60 113 C47 113 40 110 39 105 Z"
                fill="url(#cupOuterGrad)"
                stroke="#475569"
                strokeWidth="1.5"
              />
              <path
                d="M33 82 C33 86 45 89 60 89 C75 89 87 86 87 82 C87 79 75 77 60 77 C45 77 33 79 33 82 Z"
                fill="url(#cupFoamGrad)"
                stroke="#64748b"
                strokeWidth="1.4"
              />
              <path
                d="M29 29 L91 29 L83 83 C81 87 72 90 60 90 C48 90 39 87 37 83 Z"
                fill="url(#cupFoamGrad)"
                stroke="#64748b"
                strokeWidth="1.5"
              />
              <path d="M32 45 Q60 51 88 45" fill="none" stroke="#cbd5e1" strokeWidth="1.2" />
              <path d="M35 64 Q60 70 85 64" fill="none" stroke="#cbd5e1" strokeWidth="1.2" />
              <path
                d="M42 33 L46 84"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>

            {/* Foreground Rim, Glowing Codeine Syrup, Viscous Drips, 3D Ice Cubes & Striped Straw */}
            <svg
              viewBox="0 0 120 120"
              className="w-full h-full absolute inset-0"
              style={{ transform: "translateZ(15px)" }}
            >
              <defs>
                <radialGradient id="leanPoolGrad" cx="45%" cy="40%" r="60%">
                  <stop offset="0%" stopColor="#f0abfc" />
                  <stop offset="38%" stopColor="#a855f7" />
                  <stop offset="78%" stopColor="#6b21a8" />
                  <stop offset="100%" stopColor="#3b0764" />
                </radialGradient>
                <linearGradient id="leanDripGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#d946ef" />
                  <stop offset="55%" stopColor="#9333ea" />
                  <stop offset="100%" stopColor="#581c87" />
                </linearGradient>
              </defs>
              <ellipse
                cx="60"
                cy="28"
                rx="33"
                ry="10.5"
                fill="url(#cupFoamGrad)"
                stroke="#64748b"
                strokeWidth="1.6"
              />
              <ellipse
                cx="60"
                cy="28"
                rx="28.5"
                ry="8"
                fill="url(#leanPoolGrad)"
                stroke="#cbd5e1"
                strokeWidth="1"
              />
              <path
                d="M68 29 L82 6 L96 10"
                fill="none"
                stroke="#1e1b2e"
                strokeWidth="7.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M68 29 L82 6 L96 10"
                fill="none"
                stroke="#ffffff"
                strokeWidth="5.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M68 29 L82 6 L96 10"
                fill="none"
                stroke="#ef4444"
                strokeWidth="5.5"
                strokeDasharray="4 4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <g className="ice-cube-3d">
                <polygon
                  points="42,24 51,20 58,24 49,28"
                  fill="rgba(255,255,255,0.92)"
                  stroke="#e9d5ff"
                  strokeWidth="0.9"
                />
                <polygon
                  points="42,24 49,28 49,34 42,30"
                  fill="rgba(233,213,255,0.82)"
                  stroke="#c084fc"
                  strokeWidth="0.9"
                />
                <polygon
                  points="49,28 58,24 58,30 49,34"
                  fill="rgba(192,132,252,0.75)"
                  stroke="#a855f7"
                  strokeWidth="0.9"
                />
                <polygon
                  points="56,26 64,22 70,26 62,30"
                  fill="rgba(255,255,255,0.92)"
                  stroke="#e9d5ff"
                  strokeWidth="0.9"
                />
                <polygon
                  points="56,26 62,30 62,35 56,31"
                  fill="rgba(233,213,255,0.82)"
                  stroke="#c084fc"
                  strokeWidth="0.9"
                />
              </g>
              <path
                d="M39 34 C41 44 40 55 43 58 C46 58 45 45 47 36 C49 41 49 49 52 49 C55 49 54 40 56 36 Z"
                fill="url(#leanDripGrad)"
              />
              <circle cx="43" cy="63" r="2.3" fill="#a855f7" />
              <path
                d="M38 26 Q50 22 64 24"
                fill="none"
                stroke="rgba(255,255,255,0.75)"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      );

    case "rap_chain":
      return (
        <div
          className="w-full h-full flex items-center justify-center relative"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div
            className="chain-pendant-3d w-full h-full relative flex items-center justify-center"
            style={{ transformStyle: "preserve-3d" }}
          >
            <svg
              viewBox="0 0 120 120"
              className="w-full h-full absolute inset-0 pointer-events-none"
              style={{
                transform: "translateZ(-7px) translateX(-4px) translateY(5px)",
                filter: "drop-shadow(-6px 10px 14px rgba(18,12,4,0.48))",
              }}
            >
              <path
                d="M24 14 C26 42 40 58 60 64 C80 58 94 42 96 14"
                fill="none"
                stroke="#422006"
                strokeWidth="16"
                strokeLinecap="round"
              />
              <circle cx="60" cy="84" r="24" fill="#422006" />
            </svg>

            <svg
              viewBox="0 0 120 120"
              className="w-full h-full absolute inset-0"
              style={{ transform: "translateZ(7px)" }}
            >
              <defs>
                <linearGradient id="gold3DGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fef9c3" />
                  <stop offset="28%" stopColor="#facc15" />
                  <stop offset="65%" stopColor="#ca8a04" />
                  <stop offset="100%" stopColor="#713f12" />
                </linearGradient>
                <radialGradient id="vvsIceGrad" cx="38%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="45%" stopColor="#e0f2fe" />
                  <stop offset="80%" stopColor="#7dd3fc" />
                  <stop offset="100%" stopColor="#0284c7" />
                </radialGradient>
              </defs>

              {[
                { cx: 28, cy: 19, rot: 68 },
                { cx: 32, cy: 31, rot: 60 },
                { cx: 38, cy: 42, rot: 48 },
                { cx: 46, cy: 52, rot: 32 },
                { cx: 92, cy: 19, rot: -68 },
                { cx: 88, cy: 31, rot: -60 },
                { cx: 82, cy: 42, rot: -48 },
                { cx: 74, cy: 52, rot: -32 },
              ].map((l, idx) => (
                <g key={idx} transform={`translate(${l.cx}, ${l.cy}) rotate(${l.rot})`}>
                  <rect
                    x="-9"
                    y="-5.5"
                    width="18"
                    height="11"
                    rx="5.5"
                    fill="url(#gold3DGrad)"
                    stroke="#713f12"
                    strokeWidth="1.3"
                  />
                  <rect
                    x="-6"
                    y="-2.8"
                    width="12"
                    height="5.6"
                    rx="2.8"
                    fill="url(#vvsIceGrad)"
                    stroke="#ffffff"
                    strokeWidth="0.7"
                  />
                  <circle cx="-3" cy="0" r="1.2" fill="#ffffff" />
                  <circle cx="0" cy="0" r="1.2" fill="#ffffff" />
                  <circle cx="3" cy="0" r="1.2" fill="#ffffff" />
                </g>
              ))}

              <path
                d="M54 52 L66 52 L63 65 L57 65 Z"
                fill="url(#gold3DGrad)"
                stroke="#713f12"
                strokeWidth="1.3"
              />
              <rect x="57" y="54" width="6" height="9" rx="2" fill="url(#vvsIceGrad)" />
            </svg>

            <svg
              viewBox="0 0 120 120"
              className="w-full h-full absolute inset-0"
              style={{ transform: "translateZ(17px)" }}
            >
              <circle
                cx="60"
                cy="84"
                r="23"
                fill="url(#gold3DGrad)"
                stroke="#713f12"
                strokeWidth="1.6"
              />
              {Array.from({ length: 12 }, (_, i) => {
                const angle = (i * 30 * Math.PI) / 180;
                const x = (60 + Math.cos(angle) * 19.5).toFixed(1);
                const y = (84 + Math.sin(angle) * 19.5).toFixed(1);
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r="2.4"
                    fill="#ffffff"
                    stroke="#38bdf8"
                    strokeWidth="0.6"
                  />
                );
              })}
              <circle
                cx="60"
                cy="84"
                r="15.5"
                fill="url(#vvsIceGrad)"
                stroke="#fef08a"
                strokeWidth="1.4"
              />
              <polygon
                points="60,69 71,76 71,92 60,99 49,92 49,76"
                fill="none"
                stroke="#ffffff"
                strokeWidth="1.1"
              />
              <polygon
                points="60,73 68,84 60,95 52,84"
                fill="rgba(255,255,255,0.55)"
                stroke="#ffffff"
                strokeWidth="1.2"
              />
              <circle cx="60" cy="84" r="3" fill="#ffffff" />
            </svg>

            <svg
              viewBox="0 0 120 120"
              className="w-full h-full absolute inset-0 pointer-events-none"
              style={{ transform: "translateZ(23px)" }}
            >
              <g
                className="diamond-glint"
                style={{ "--glint-delay": "0s", transformOrigin: "44px 72px" } as CSSProperties}
              >
                <path d="M44 63 L46 70 L53 72 L46 74 L44 81 L42 74 L35 72 L42 70 Z" fill="#ffffff" />
              </g>
              <g
                className="diamond-glint"
                style={{ "--glint-delay": "-0.7s", transformOrigin: "77px 78px" } as CSSProperties}
              >
                <path
                  d="M77 70 L78.8 76.2 L85 78 L78.8 79.8 L77 86 L75.2 79.8 L69 78 L75.2 76.2 Z"
                  fill="#e0f2fe"
                />
              </g>
              <g
                className="diamond-glint"
                style={{ "--glint-delay": "-1.3s", transformOrigin: "34px 34px" } as CSSProperties}
              >
                <path
                  d="M34 27 L35.5 32.5 L41 34 L35.5 35.5 L34 41 L32.5 35.5 L27 34 L32.5 32.5 Z"
                  fill="#fef08a"
                />
              </g>
            </svg>
          </div>
        </div>
      );

    case "rap_money":
      return (
        <div
          className="w-full h-full flex items-center justify-center relative"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div
            className="cash-stack-3d w-full h-full relative flex items-center justify-center"
            style={{ transformStyle: "preserve-3d" }}
          >
            <svg
              viewBox="0 0 120 120"
              className="w-full h-full absolute inset-0 pointer-events-none"
              style={{
                transform: "translateZ(-6px) translateX(-4px) translateY(5px)",
                filter: "drop-shadow(-6px 10px 14px rgba(5,28,14,0.48))",
              }}
            >
              <polygon points="14,50 84,30 108,58 38,78 38,96 108,76 108,58" fill="#052e16" />
              <polygon points="14,50 38,78 38,96 14,68" fill="#052e16" />
            </svg>

            <svg
              viewBox="0 0 120 120"
              className="w-full h-full absolute inset-0"
              style={{ transform: "translateZ(7px)" }}
            >
              <defs>
                <linearGradient id="billTopGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ecfdf5" />
                  <stop offset="45%" stopColor="#bbf7d0" />
                  <stop offset="100%" stopColor="#4ade80" />
                </linearGradient>
                <linearGradient id="strapGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fef3c7" />
                  <stop offset="50%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#b45309" />
                </linearGradient>
                <pattern id="paperLayers" width="4" height="3" patternUnits="userSpaceOnUse">
                  <line x1="0" y1="0" x2="4" y2="0" stroke="#14532d" strokeWidth="1.2" />
                  <line x1="0" y1="1.5" x2="4" y2="1.5" stroke="#bbf7d0" strokeWidth="1.2" />
                </pattern>
              </defs>

              <polygon
                points="12,50 38,78 38,98 12,70"
                fill="url(#paperLayers)"
                stroke="#052e16"
                strokeWidth="1.4"
              />
              <polygon
                points="38,78 108,56 108,76 38,98"
                fill="url(#paperLayers)"
                stroke="#052e16"
                strokeWidth="1.4"
              />
              <polygon
                points="12,50 82,28 108,56 38,78"
                fill="url(#billTopGrad)"
                stroke="#14532d"
                strokeWidth="1.6"
              />
              <polygon
                points="18,50 80,31 101,54 39,73"
                fill="none"
                stroke="#15803d"
                strokeWidth="1.1"
                strokeDasharray="3 1.5"
              />
              <ellipse
                cx="60"
                cy="53"
                rx="11"
                ry="8"
                transform="rotate(-17 60 53)"
                fill="#dcfce7"
                stroke="#14532d"
                strokeWidth="1.3"
              />
              <circle cx="60" cy="52" r="3.5" fill="#166534" />
              <path d="M54 57 Q60 53 66 57" fill="#166534" />
              <text
                x="23"
                y="53"
                transform="rotate(-17 23 53)"
                fill="#052e16"
                fontFamily="monospace"
                fontWeight="800"
                fontSize="8"
              >
                100
              </text>
              <text
                x="84"
                y="55"
                transform="rotate(-17 84 55)"
                fill="#052e16"
                fontFamily="monospace"
                fontWeight="800"
                fontSize="8"
              >
                100
              </text>
            </svg>

            <svg
              viewBox="0 0 120 120"
              className="w-full h-full absolute inset-0"
              style={{ transform: "translateZ(16px)" }}
            >
              <polygon
                points="43,40 59,35 85,63 69,68"
                fill="url(#strapGoldGrad)"
                stroke="#78350f"
                strokeWidth="1.4"
              />
              <polygon
                points="69,68 85,63 85,83 69,88"
                fill="#d97706"
                stroke="#78350f"
                strokeWidth="1.4"
              />
              <text
                x="53"
                y="56"
                transform="rotate(-17 53 56)"
                fill="#451a03"
                fontFamily="monospace"
                fontWeight="900"
                fontSize="7.5"
              >
                $100K
              </text>
            </svg>
          </div>
        </div>
      );

    case "rap_lambo":
      return (
        <div
          className="w-full h-full flex items-center justify-center relative"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div
            className="lambo-body-3d w-full h-full relative flex items-center justify-center"
            style={{ transformStyle: "preserve-3d" }}
          >
            <svg
              viewBox="0 0 120 120"
              className="w-full h-full absolute inset-0 pointer-events-none"
              style={{
                transform: "translateZ(-6px) translateX(-4px) translateY(5px)",
                filter: "drop-shadow(-6px 10px 14px rgba(10,20,4,0.5))",
              }}
            >
              <path d="M10 72 L28 52 L56 40 L96 42 L112 56 L110 76 L14 78 Z" fill="#0f172a" />
            </svg>

            <svg
              viewBox="0 0 120 120"
              className="w-full h-full absolute inset-0"
              style={{ transform: "translateZ(8px)" }}
            >
              <defs>
                <linearGradient id="lamboPaintGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ecfccb" />
                  <stop offset="25%" stopColor="#a3e635" />
                  <stop offset="65%" stopColor="#65a30d" />
                  <stop offset="100%" stopColor="#365314" />
                </linearGradient>
                <linearGradient id="windshieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="35%" stopColor="#0f172a" />
                  <stop offset="100%" stopColor="#020617" />
                </linearGradient>
              </defs>

              <path
                d="M92 43 L112 36 L114 40 L96 47 Z"
                fill="#18181b"
                stroke="#a3e635"
                strokeWidth="1"
              />
              <line x1="98" y1="45" x2="96" y2="53" stroke="#18181b" strokeWidth="2.5" />
              <line x1="107" y1="41" x2="105" y2="53" stroke="#18181b" strokeWidth="2.5" />

              <path
                d="M8 70 L24 53 L54 39 L88 41 L110 53 L112 72 L96 75 L22 76 L8 73 Z"
                fill="url(#lamboPaintGrad)"
                stroke="#1a2e05"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <polygon
                points="30,53 55,41 82,43 68,55"
                fill="url(#windshieldGrad)"
                stroke="#bef264"
                strokeWidth="1.1"
              />
              <line
                x1="38"
                y1="51"
                x2="54"
                y2="43"
                stroke="rgba(255,255,255,0.65)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <polygon
                points="56,58 80,54 76,68 52,67"
                fill="#18181b"
                stroke="#365314"
                strokeWidth="1"
              />
              <path d="M8 72 L30 75 L30 78 L8 75 Z" fill="#18181b" />
              <line
                x1="12"
                y1="66"
                x2="38"
                y2="56"
                stroke="#ecfccb"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M15 63 L25 60 L21 66"
                fill="none"
                stroke="#fef08a"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <rect x="104" y="55" width="6" height="3" rx="1" fill="#ef4444" />
            </svg>

            <div
              className="w-full h-full absolute inset-0 pointer-events-none"
              style={{ transform: "translateZ(16px)", transformStyle: "preserve-3d" }}
            >
              <div
                className="tape-reel-3d w-7 h-7 rounded-full border-2 flex items-center justify-center absolute left-[24%] bottom-[22%]"
                style={{
                  background: "#09090b",
                  borderColor: "#18181b",
                  boxShadow: "-3px 4px 0 #09090b",
                }}
              >
                <div
                  className="w-4.5 h-4.5 rounded-full border flex items-center justify-center"
                  style={{
                    background: "linear-gradient(135deg, #fef08a, #ca8a04)",
                    borderColor: "#facc15",
                  }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />
                </div>
              </div>
              <div
                className="tape-reel-3d w-8 h-8 rounded-full border-2 flex items-center justify-center absolute right-[14%] bottom-[22%]"
                style={{
                  background: "#09090b",
                  borderColor: "#18181b",
                  boxShadow: "-3px 4px 0 #09090b",
                }}
              >
                <div
                  className="w-5 h-5 rounded-full border flex items-center justify-center"
                  style={{
                    background: "linear-gradient(135deg, #fef08a, #ca8a04)",
                    borderColor: "#facc15",
                  }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      );

    case "rap_watch":
      return (
        <div
          className="w-full h-full flex items-center justify-center relative"
          style={{ transformStyle: "preserve-3d" }}
        >
          <svg
            viewBox="0 0 120 120"
            className="w-full h-full absolute inset-0 pointer-events-none"
            style={{
              transform: "translateZ(-7px) translateX(-4px) translateY(5px)",
              filter: "drop-shadow(-6px 10px 14px rgba(28,8,16,0.48))",
            }}
          >
            <path
              d="M42 10 L78 10 L84 32 L92 44 L92 76 L84 88 L78 110 L42 110 L36 88 L28 76 L28 44 L36 32 Z"
              fill="#4c0519"
            />
          </svg>

          <svg
            viewBox="0 0 120 120"
            className="w-full h-full absolute inset-0"
            style={{ transform: "translateZ(7px)" }}
          >
            <defs>
              <linearGradient id="roseGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffe4e6" />
                <stop offset="30%" stopColor="#fda4af" />
                <stop offset="65%" stopColor="#fbbf24" />
                <stop offset="100%" stopColor="#9f1239" />
              </linearGradient>
              <radialGradient id="tiffanyDialGrad" cx="45%" cy="40%" r="60%">
                <stop offset="0%" stopColor="#a5f3fc" />
                <stop offset="45%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#155e75" />
              </radialGradient>
            </defs>

            {[12, 21, 91, 100].map((y) => (
              <g key={y}>
                <rect
                  x="41"
                  y={y}
                  width="38"
                  height="7.5"
                  rx="2"
                  fill="url(#roseGoldGrad)"
                  stroke="#881337"
                  strokeWidth="1.2"
                />
                <rect x="49" y={y + 1.5} width="8" height="4.5" rx="1" fill="#e0f2fe" />
                <rect x="63" y={y + 1.5} width="8" height="4.5" rx="1" fill="#e0f2fe" />
              </g>
            ))}

            <rect
              x="90"
              y="43"
              width="6"
              height="6"
              rx="1.5"
              fill="url(#roseGoldGrad)"
              stroke="#881337"
              strokeWidth="1.1"
            />
            <rect
              x="92"
              y="56"
              width="7"
              height="8"
              rx="2"
              fill="url(#roseGoldGrad)"
              stroke="#881337"
              strokeWidth="1.2"
            />
            <rect
              x="90"
              y="71"
              width="6"
              height="6"
              rx="1.5"
              fill="url(#roseGoldGrad)"
              stroke="#881337"
              strokeWidth="1.1"
            />

            <polygon
              points="38,28 82,28 92,42 92,78 82,92 38,92 28,78 28,42"
              fill="url(#roseGoldGrad)"
              stroke="#881337"
              strokeWidth="1.6"
            />
          </svg>

          <svg
            viewBox="0 0 120 120"
            className="w-full h-full absolute inset-0"
            style={{ transform: "translateZ(16px)" }}
          >
            <polygon
              points="43,32 77,32 88,43 88,77 77,88 43,88 32,77 32,43"
              fill="#e0f2fe"
              stroke="#fbbf24"
              strokeWidth="1.6"
            />
            {[
              [45, 35],
              [75, 35],
              [85, 45],
              [85, 75],
              [75, 85],
              [45, 85],
              [35, 75],
              [35, 45],
            ].map(([sx, sy], idx) => (
              <circle
                key={idx}
                cx={sx}
                cy={sy}
                r="1.8"
                fill="#fbbf24"
                stroke="#713f12"
                strokeWidth="0.7"
              />
            ))}

            <circle
              cx="60"
              cy="60"
              r="21"
              fill="url(#tiffanyDialGrad)"
              stroke="#fef08a"
              strokeWidth="1.4"
            />
            <circle cx="48" cy="60" r="4.5" fill="#083344" stroke="#fef08a" strokeWidth="0.8" />
            <circle cx="72" cy="60" r="4.5" fill="#083344" stroke="#fef08a" strokeWidth="0.8" />
            <circle cx="60" cy="71" r="4.5" fill="#083344" stroke="#fef08a" strokeWidth="0.8" />

            <line
              x1="60"
              y1="60"
              x2="52"
              y2="51"
              stroke="#ffffff"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <line
              x1="60"
              y1="60"
              x2="71"
              y2="52"
              stroke="#fef08a"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <circle cx="60" cy="60" r="2.2" fill="#fbbf24" />
            <path
              d="M44 47 A18 18 0 0 1 73 45"
              fill="none"
              stroke="rgba(255,255,255,0.65)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      );

    case "media":
    case "sub_video":
    default:
      return (
        <div
          className="w-full h-full flex flex-col items-center justify-center relative"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div
            className="w-[74%] flex items-end justify-between px-2 -mb-0.5 z-10"
            style={{ transform: "translateZ(8px)" }}
          >
            <div
              className="w-4 h-2 rounded-t-xs border-t border-x border-white/25"
              style={{ background: "var(--accent-primary)" }}
            />
            <div
              className="w-12 h-3.5 rounded-t-md border-2 border-b-0 flex items-center justify-center"
              style={{
                background: "var(--chassis-mid)",
                borderColor: "var(--chassis-border)",
                boxShadow: "-3px 2px 0 var(--chassis-edge)",
              }}
            >
              <div
                className="w-6 h-1 rounded-full"
                style={{ background: "var(--chassis-edge)" }}
              />
            </div>
            <div
              className="w-3 h-1.5 rounded-t-xs"
              style={{ background: "var(--stamp-color)" }}
            />
          </div>

          <div
            className="w-[88%] h-[62%] rounded-2xl relative flex items-center justify-center"
            style={{
              background: "var(--chassis-bg)",
              border: "2px solid var(--chassis-border)",
              borderLeft: "4px solid var(--accent-primary)",
              transform: "translateZ(8px)",
              transformStyle: "preserve-3d",
              boxShadow:
                "-7px 10px 0 var(--chassis-edge), -12px 18px 26px rgba(16,13,10,0.36)",
            }}
          >
            <span
              className="mono-meta text-[5.5px] uppercase absolute top-1.5 left-2"
              style={{ color: "var(--stamp-color)" }}
            >
              {code}
            </span>
            <span
              className="w-2 h-2 rounded-full rec-dot absolute top-1.5 right-2"
              style={{
                background: "var(--accent-primary)",
                boxShadow: "0 0 8px var(--accent-primary)",
              }}
            />

            <div
              className="camera-lens-3d w-14 h-14 sm:w-15 sm:h-15 rounded-full border-2 flex items-center justify-center relative"
              style={{
                background: "var(--chassis-mid)",
                borderColor: "var(--accent-primary)",
                boxShadow:
                  "-5px 7px 0 var(--chassis-edge), 0 6px 14px rgba(0,0,0,0.45)",
              }}
            >
              <div
                className="w-10 h-10 rounded-full border-2 flex items-center justify-center"
                style={{
                  background: "var(--chassis-bg)",
                  borderColor: "var(--stamp-color)",
                  transform: "translateZ(7px)",
                }}
              >
                <div
                  className="w-4 h-4 rounded-full relative"
                  style={{ background: "var(--accent-primary)", opacity: 0.9 }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-white/80 absolute top-0.5 left-0.5" />
                </div>
              </div>
            </div>
          </div>
        </div>
      );
  }
}

export function RecordHardwareItem({
  name,
  by,
  iconKey,
  idx,
  theme,
  animateSpawn,
  isPlayingFolder,
  onClick,
}: {
  name: string;
  by: string;
  iconKey: string;
  idx: number;
  theme: HardwareThemeSlot;
  animateSpawn: boolean;
  isPlayingFolder: boolean;
  onClick: () => void;
}) {
  const code = `0${idx + 1}`;
  const spawnDelayMs = idx * 85;

  return (
    <div
      onClick={onClick}
      className={`flex flex-col items-center text-center min-w-0 group cursor-pointer ${
        animateSpawn ? "spawn-active" : ""
      } ${isPlayingFolder ? "is-playing-folder" : ""}`}
      style={
        {
          "--spawn-delay": `${spawnDelayMs}ms`,
          "--chassis-bg": theme.chassisBg,
          "--chassis-mid": theme.chassisMid,
          "--chassis-edge": theme.chassisEdge,
          "--chassis-border": theme.chassisBorder,
          "--accent-primary": theme.accentPrimary,
          "--accent-secondary": theme.accentSecondary,
          "--pad-idle": theme.padIdle,
          "--knob-ink": theme.knobInk,
          "--stamp-color": theme.stampColor,
        } as CSSProperties
      }
    >
      <div className="icon-stage">
        <div className="icon-shadow" />
        <div className="icon-3d-rig">
          <HardwareObject3D iconKey={iconKey} code={code} />
        </div>
      </div>

      <div className="mt-3 sm:mt-4">
        <h3 className="record-heading text-base sm:text-lg text-[var(--ink)]">
          {name}
        </h3>
        <p className="text-xs text-[var(--ink-soft)] mt-0.5">{by}</p>
      </div>
    </div>
  );
}

export function CreateRecordHardwareButton({
  label,
  idx,
  animateSpawn,
  onClick,
}: {
  label: string;
  idx: number;
  animateSpawn: boolean;
  onClick: () => void;
}) {
  const spawnDelayMs = idx * 85;
  return (
    <div
      onClick={onClick}
      className={`flex flex-col items-center text-center min-w-0 group cursor-pointer ${
        animateSpawn ? "spawn-active" : ""
      }`}
      style={{ "--spawn-delay": `${spawnDelayMs}ms` } as CSSProperties}
    >
      <div className="icon-stage">
        <div className="icon-shadow" />
        <div className="icon-3d-rig">
          <div className="w-full h-full rounded-[12px] border border-dashed border-[var(--ink)]/25 group-hover:border-[var(--ink)]/65 flex items-center justify-center transition bg-[var(--card)]/55">
            <div className="w-10 h-10 rounded-full bg-[var(--card)] border border-[var(--hair)] flex items-center justify-center text-lg font-light text-[var(--ink)] group-hover:scale-105 transition">
              +
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 sm:mt-4">
        <h3 className="record-heading text-base sm:text-lg text-[var(--ink)]">
          {label}
        </h3>
        <p className="text-xs text-[var(--ink-soft)] mt-0.5">custom 3d folder</p>
      </div>
    </div>
  );
}
