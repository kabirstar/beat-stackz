import { useEffect, useRef, useState } from "react";

export const VAULT_GATE_PASSCODE = "classics";
export const VAULT_GATE_SESSION_KEY = "bpackz_vault_gate_unlocked_v1";

export function isVaultPasscodeValid(input: string): boolean {
  return input.trim().toLowerCase() === VAULT_GATE_PASSCODE;
}

export function maskWithAsterisks(input: string): string {
  return "*".repeat(input.length);
}

export function VaultGateScreen({ onUnlock }: { onUnlock: () => void }) {
  const [passcode, setPasscode] = useState("");
  const [status, setStatus] = useState<"idle" | "error" | "unlocking">("idle");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const triggerUnlock = () => {
    if (status === "unlocking") return;
    setStatus("unlocking");
    window.setTimeout(() => {
      onUnlock();
    }, 520);
  };

  const handleChange = (nextValue: string) => {
    if (status === "unlocking") return;
    const cleaned = nextValue.slice(0, 16);
    setPasscode(cleaned);
    if (status === "error") {
      setStatus("idle");
    }
    if (isVaultPasscodeValid(cleaned)) {
      triggerUnlock();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isVaultPasscodeValid(passcode)) {
      triggerUnlock();
    } else {
      setStatus("error");
    }
  };

  const maskedAsterisks = maskWithAsterisks(passcode);
  const boltAngles = [0, 45, 90, 135, 180, 225, 270, 315];

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className="min-h-screen w-full bg-[#09080b] text-[#edeae4] flex flex-col items-center justify-between p-4 sm:p-8 relative overflow-hidden select-none"
    >
      {/* Subtle Brushed Steel & Studio Grid Backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 50%, rgba(220, 38, 38, 0.16) 0%, transparent 62%), radial-gradient(rgba(237, 234, 228, 0.12) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 24px 24px",
        }}
      />

      {/* Top Vault Frame Header */}
      <div className="w-full max-w-5xl flex items-center justify-between z-10 px-2 pt-1">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              status === "unlocking"
                ? "bg-emerald-400 shadow-[0_0_12px_#34d399]"
                : "bg-red-500 shadow-[0_0_10px_#ef4444]"
            }`}
          />
          <span className="mono-meta text-[10px] sm:text-[11px] uppercase tracking-[0.22em] text-[#edeae4]/75">
            BEAT STACKZ · SECURITY GATE MK-I
          </span>
        </div>
        <span className="mono-meta text-[10px] uppercase tracking-[0.2em] text-[#edeae4]/50">
          {status === "unlocking" ? "BOLTS RETRACTED" : "HEAVY STUDIO VAULT"}
        </span>
      </div>

      {/* Center 3D Circular Steel Bank Vault Door */}
      <div className="relative flex items-center justify-center my-auto py-4 z-10">
        {/* Outer Vault Wall Recess Shadow */}
        <div
          className={`relative w-[330px] h-[330px] sm:w-[440px] sm:h-[440px] rounded-full flex items-center justify-center transition-all duration-500 ${
            status === "unlocking" ? "scale-[1.04]" : ""
          }`}
          style={{
            background:
              "radial-gradient(circle at 32% 28%, #27252d 0%, #141218 52%, #08070a 100%)",
            boxShadow:
              "0 28px 70px rgba(0,0,0,0.85), inset 0 2px 4px rgba(255,255,255,0.18), inset 0 -10px 24px rgba(0,0,0,0.8)",
            border: "4px solid #2e2b36",
          }}
        >
          {/* 8 Perimeter Steel Locking Pistons / Bolts */}
          {boltAngles.map((deg) => (
            <div
              key={deg}
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              style={{ transform: `rotate(${deg}deg)` }}
            >
              <div
                className="w-4 sm:w-5 h-7 sm:h-9 rounded-xs border border-white/20 transition-all duration-500"
                style={{
                  transform:
                    status === "unlocking"
                      ? "translateY(-142px) sm:translateY(-190px)"
                      : "translateY(-162px) sm:translateY(-214px)",
                  marginTop: status === "unlocking" ? "26px" : "0px",
                  background:
                    "linear-gradient(90deg, #52525b 0%, #d4d4d8 48%, #3f3f46 100%)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.7)",
                }}
              />
            </div>
          ))}

          {/* Inner Stepped Steel Vault Door Ring */}
          <div
            className="w-[286px] h-[286px] sm:w-[382px] sm:h-[382px] rounded-full flex items-center justify-center relative"
            style={{
              background:
                "conic-gradient(from 45deg, #18161d, #27242e, #121016, #2b2733, #15131a, #27242e, #18161d)",
              border: "2px solid rgba(255,255,255,0.14)",
              boxShadow:
                "inset 0 10px 28px rgba(0,0,0,0.75), 0 6px 18px rgba(0,0,0,0.65)",
            }}
          >
            {/* Rotating 3-Spoke Vault Combination Wheel Spokes Behind Hub */}
            <div
              className="pointer-events-none absolute inset-6 sm:inset-8 rounded-full flex items-center justify-center transition-transform duration-700 ease-out"
              style={{
                border: "1.5px dashed rgba(237,234,228,0.18)",
                transform:
                  status === "unlocking"
                    ? "rotate(360deg)"
                    : `rotate(${passcode.length * 18}deg)`,
              }}
            >
              {[0, 120, 240].map((spokeDeg) => (
                <div
                  key={spokeDeg}
                  className="absolute w-2.5 sm:w-3 h-full flex flex-col justify-between py-2"
                  style={{ transform: `rotate(${spokeDeg}deg)` }}
                >
                  <div
                    className="w-full h-12 sm:h-16 rounded-full"
                    style={{
                      background:
                        "linear-gradient(90deg, #27272a, #a1a1aa, #27272a)",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Center Combination Lock Hub (Password Input in the Middle of the Vault) */}
            <form
              onSubmit={handleSubmit}
              className={`relative z-20 w-[218px] h-[218px] sm:w-[276px] sm:h-[276px] rounded-full flex flex-col items-center justify-center px-5 sm:px-7 text-center transition-transform duration-200 ${
                status === "error" ? "scale-[0.97]" : ""
              }`}
              style={{
                background:
                  "radial-gradient(circle at 50% 35%, #191720 0%, #0b0a0e 78%)",
                border:
                  status === "unlocking"
                    ? "2.5px solid #34d399"
                    : status === "error"
                      ? "2.5px solid #ef4444"
                      : "2.5px solid rgba(220, 38, 38, 0.65)",
                boxShadow:
                  "0 14px 36px rgba(0,0,0,0.85), inset 0 2px 6px rgba(255,255,255,0.12)",
              }}
            >
              <span className="mono-meta text-[8px] sm:text-[9px] uppercase tracking-[0.24em] text-[#edeae4]/60 mb-1">
                {status === "unlocking"
                  ? "ACCESS GRANTED"
                  : status === "error"
                    ? "INVALID PASSCODE"
                    : "THE VAULT"}
              </span>

              <h1 className="display-heading text-lg sm:text-2xl text-[#edeae4] tracking-tight mb-2.5">
                ENTER CODE
              </h1>

              {/* Center Passcode Window Showing Literal '*' Characters */}
              <div className="relative w-full">
                <div
                  data-testid="vault-gate-asterisks"
                  className={`w-full h-11 sm:h-12 rounded-xl bg-[#050507] border flex items-center justify-center px-3 mono-meta text-lg sm:text-xl tracking-[0.32em] transition-colors ${
                    status === "unlocking"
                      ? "border-emerald-400 text-emerald-300"
                      : status === "error"
                        ? "border-red-500 text-red-400"
                        : "border-white/20 text-[#edeae4]"
                  }`}
                  style={{
                    boxShadow: "inset 0 3px 8px rgba(0,0,0,0.85)",
                  }}
                >
                  {maskedAsterisks.length > 0 ? (
                    <span>{maskedAsterisks}</span>
                  ) : (
                    <span className="text-[10px] sm:text-[11px] tracking-[0.22em] text-[#edeae4]/30 uppercase">
                      ********
                    </span>
                  )}
                </div>

                {/* Real Accessible Input Overlaid Directly in the Center */}
                <input
                  ref={inputRef}
                  type="password"
                  aria-label="Vault Passcode"
                  value={passcode}
                  onChange={(e) => handleChange(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-text"
                />
              </div>

              <button
                type="submit"
                className="mt-3 px-4 py-1.5 rounded-full mono-meta text-[9px] sm:text-[10px] uppercase tracking-[0.2em] cursor-pointer transition border border-white/15 bg-white/10 hover:bg-white/20 text-[#edeae4]"
              >
                {status === "unlocking" ? "OPENING..." : "UNLOCK VAULT ↵"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Bottom Vault Frame Footer */}
      <div className="w-full max-w-5xl flex items-center justify-between z-10 px-2 pb-1 mono-meta text-[9px] sm:text-[10px] uppercase tracking-[0.18em] text-[#edeae4]/45">
        <span>SWISH × TODO</span>
        <span>TYPE PASSCODE TO UNLOCK</span>
      </div>
    </div>
  );
}
