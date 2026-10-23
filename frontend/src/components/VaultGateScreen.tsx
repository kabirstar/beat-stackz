import { useState } from "react";

export const VAULT_GATE_PASSCODE = "classics";
export const VAULT_GATE_SESSION_KEY = "bpackz_vault_gate_unlocked_v1";

export function isVaultPasscodeValid(input: string): boolean {
  return input.trim().toLowerCase() === VAULT_GATE_PASSCODE;
}

export function maskWithAsterisks(input: string): string {
  return "*".repeat(input.length);
}

export interface VaultGateScreenProps {
  authMode: "signin" | "signup";
  authName: string;
  authEmail: string;
  authPassword: string;
  authError: string | null;
  onChangeMode: (mode: "signin" | "signup") => void;
  onChangeName: (name: string) => void;
  onChangeEmail: (email: string) => void;
  onChangePassword: (password: string) => void;
  onSubmitAuth: (e: React.FormEvent) => Promise<boolean> | boolean;
  onUnlock: () => void;
}

export function VaultGateScreen({
  authMode,
  authName,
  authEmail,
  authPassword,
  authError,
  onChangeMode,
  onChangeName,
  onChangeEmail,
  onChangePassword,
  onSubmitAuth,
  onUnlock,
}: VaultGateScreenProps) {
  const [gateStep, setGateStep] = useState<"invite" | "auth">("invite");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "unlocking">("idle");

  const triggerMechanicalUnlock = () => {
    setStatus("unlocking");
    window.setTimeout(() => {
      onUnlock();
    }, 620);
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isVaultPasscodeValid(inviteCode)) {
      setInviteError(null);
      onChangeMode("signup");
      setGateStep("auth");
    } else {
      setInviteError("INVALID INVITE CODE");
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status !== "idle") return;
    setStatus("submitting");
    const ok = await onSubmitAuth(e);
    if (ok) {
      triggerMechanicalUnlock();
    } else {
      setStatus("idle");
    }
  };

  const maskedInviteAsterisks = maskWithAsterisks(inviteCode);
  const maskedAsterisks = maskWithAsterisks(authPassword);
  const boltAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  const unlocking = status === "unlocking";
  const activeError = gateStep === "invite" ? inviteError : authError;

  return (
    <div
      className="min-h-screen w-full text-[#edeae4] flex flex-col items-center justify-between p-4 sm:p-7 relative overflow-hidden select-none"
      style={{
        background:
          "linear-gradient(145deg, #16151c 0%, #0d0c11 45%, #15131b 75%, #09080c 100%)",
      }}
    >
      {/* ==================== FULL SAFE INTERIOR / EXTERIOR ARMOR WALL ==================== */}
      {/* Brushed Steel Grain + Subtle Radial Studio Spotlight */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 50%, rgba(220, 38, 38, 0.14) 0%, rgba(0, 0, 0, 0.65) 72%), repeating-linear-gradient(90deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 1px, transparent 1px, transparent 4px)",
        }}
      />

      {/* Recessed Steel Safe Wall Frame Border + Welded Armor Seams */}
      <div className="pointer-events-none absolute inset-3 sm:inset-5 rounded-3xl border-2 border-white/10 shadow-[inset_0_0_60px_rgba(0,0,0,0.9)]">
        {/* Horizontal & Vertical Armor Plate Seam Lines */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-black/80 border-b border-white/10" />
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-black/80 border-r border-white/10" />

        {/* Corner & Perimeter Machined Steel Rivets */}
        {[
          "top-3 left-3",
          "top-3 left-1/4",
          "top-3 right-1/4",
          "top-3 right-3",
          "bottom-3 left-3",
          "bottom-3 left-1/4",
          "bottom-3 right-1/4",
          "bottom-3 right-3",
          "top-1/4 left-3",
          "bottom-1/4 left-3",
          "top-1/4 right-3",
          "bottom-1/4 right-3",
        ].map((pos) => (
          <div
            key={pos}
            className={`absolute ${pos} w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full border border-white/25`}
            style={{
              background: "radial-gradient(circle at 35% 30%, #71717a, #18181b 75%)",
              boxShadow: "0 2px 5px rgba(0,0,0,0.85), inset 0 1px 1px rgba(255,255,255,0.35)",
            }}
          />
        ))}
      </div>

      {/* Top Safe Manufacturer Serial Plate & Status Bar */}
      <div className="w-full max-w-5xl flex items-center justify-between z-10 px-4 sm:px-6 pt-3">
        <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-[#0b0a0f]/90 border border-white/15 shadow-md">
          <span
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              unlocking
                ? "bg-emerald-400 shadow-[0_0_12px_#34d399]"
                : authError
                  ? "bg-red-500 shadow-[0_0_12px_#ef4444]"
                  : "bg-red-500 shadow-[0_0_10px_#ef4444]"
            }`}
          />
          <span className="mono-meta text-[9px] sm:text-[10px] uppercase tracking-[0.22em] text-[#edeae4]/85">
            VAULT NO. 808-BS · ARMOURED STUDIO SAFE
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0b0a0f]/90 border border-white/15 shadow-md">
          <span className="mono-meta text-[9px] uppercase tracking-[0.18em] text-[#edeae4]/60">
            {unlocking ? "HYDRAULIC BOLTS: RETRACTED" : "HYDRAULIC BOLTS: ENGAGED"}
          </span>
        </div>
      </div>

      {/* ==================== CENTER 3D CIRCULAR BANK VAULT DOOR ==================== */}
      <div className="relative flex items-center justify-center my-auto py-2 z-10">
        {/* Heavy Forged Steel Vault Hinges Mounted to the Right Safe Wall */}
        <div className="pointer-events-none hidden md:flex flex-col justify-between h-[320px] absolute -right-14 z-20">
          {[0, 1].map((hingeIdx) => (
            <div key={hingeIdx} className="flex items-center">
              {/* Arm connecting door to hinge barrel */}
              <div
                className="w-10 h-8 rounded-l-md border-y border-l border-white/25"
                style={{
                  background: "linear-gradient(180deg, #3f3f46 0%, #71717a 45%, #18181b 100%)",
                  boxShadow: "0 8px 20px rgba(0,0,0,0.8)",
                }}
              />
              {/* Vertical Hinge Barrel */}
              <div
                className="w-7 h-20 rounded-md border border-white/30 flex flex-col justify-between p-1"
                style={{
                  background:
                    "linear-gradient(90deg, #18181b 0%, #a1a1aa 45%, #27272a 85%, #09090b 100%)",
                  boxShadow: "0 12px 28px rgba(0,0,0,0.9)",
                }}
              >
                <div className="w-full h-1.5 rounded-full bg-black/60" />
                <div className="w-full h-1.5 rounded-full bg-black/60" />
              </div>
            </div>
          ))}
        </div>

        {/* Outer Recessed Steel Door Jamb / Frame */}
        <div
          className={`relative w-[360px] h-[360px] sm:w-[490px] sm:h-[490px] rounded-full flex items-center justify-center transition-all duration-700 ${
            unlocking ? "scale-[1.04]" : ""
          }`}
          style={{
            background:
              "radial-gradient(circle at 30% 25%, #32303a 0%, #17151c 50%, #09080c 100%)",
            boxShadow:
              "0 32px 80px rgba(0,0,0,0.92), 0 0 0 10px #14131a, 0 0 0 12px rgba(255,255,255,0.12), inset 0 3px 6px rgba(255,255,255,0.22), inset 0 -12px 28px rgba(0,0,0,0.88)",
            border: "4px solid #3f3c4a",
          }}
        >
          {/* 8 Perimeter Heavy Chrome Locking Bolts */}
          {boltAngles.map((deg) => (
            <div
              key={deg}
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              style={{ transform: `rotate(${deg}deg)` }}
            >
              <div
                className="w-5 sm:w-6 h-8 sm:h-10 rounded-xs border border-white/30 transition-all duration-500"
                style={{
                  transform: unlocking
                    ? "translateY(-150px) sm:translateY(-202px)"
                    : "translateY(-174px) sm:translateY(-236px)",
                  marginTop: unlocking ? "28px" : "0px",
                  background:
                    "linear-gradient(90deg, #3f3f46 0%, #f4f4f5 48%, #27272a 100%)",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.8)",
                }}
              />
            </div>
          ))}

          {/* Slowly Spinning Outer Notched Combination Gear Ring */}
          <div
            className="pointer-events-none absolute inset-4 sm:inset-6 rounded-full vault-gear-slow-spin"
            style={{
              border: "3px dashed rgba(237, 234, 228, 0.16)",
              boxShadow: "inset 0 0 24px rgba(0,0,0,0.7)",
            }}
          />

          {/* Inner Stepped Brushed Steel Vault Door Disc */}
          <div
            className="w-[318px] h-[318px] sm:w-[432px] sm:h-[432px] rounded-full flex items-center justify-center relative"
            style={{
              background:
                "conic-gradient(from 45deg, #18161d, #2a2733, #121016, #2e2a37, #15131a, #2a2733, #18161d)",
              border: "2px solid rgba(255,255,255,0.16)",
              boxShadow:
                "inset 0 12px 32px rgba(0,0,0,0.8), 0 8px 22px rgba(0,0,0,0.7)",
            }}
          >
            {/* Slowly Spinning 3-Spoke Vault Combination Wheel Behind Hub */}
            <div
              className={`pointer-events-none absolute inset-4 sm:inset-6 rounded-full flex items-center justify-center ${
                unlocking
                  ? "transition-transform duration-700 ease-out rotate-[540deg]"
                  : "vault-wheel-slow-spin"
              }`}
              style={{
                border: "2px solid rgba(255,255,255,0.12)",
              }}
            >
              {[0, 120, 240].map((spokeDeg) => (
                <div
                  key={spokeDeg}
                  className="absolute w-3 sm:w-3.5 h-full flex flex-col justify-between py-1.5"
                  style={{ transform: `rotate(${spokeDeg}deg)` }}
                >
                  <div
                    className="w-full h-14 sm:h-20 rounded-full border border-white/20"
                    style={{
                      background:
                        "linear-gradient(90deg, #27272a 0%, #e4e4e7 50%, #27272a 100%)",
                      boxShadow: "0 3px 10px rgba(0,0,0,0.75)",
                    }}
                  />
                </div>
              ))}
            </div>

            {/* ==================== CENTER VAULT INVITE CODE / SIGN-ON HUB ==================== */}
            {gateStep === "invite" ? (
              <form
                onSubmit={handleInviteSubmit}
                autoComplete="off"
                className="relative z-20 w-[268px] h-[268px] sm:w-[336px] sm:h-[336px] rounded-full flex flex-col items-center justify-center px-6 sm:px-8 text-center"
                style={{
                  background:
                    "radial-gradient(circle at 50% 30%, #1c1924 0%, #09080c 82%)",
                  border: activeError
                    ? "3px solid #ef4444"
                    : "3px solid rgba(220, 38, 38, 0.72)",
                  boxShadow:
                    "0 18px 44px rgba(0,0,0,0.92), inset 0 2px 8px rgba(255,255,255,0.14)",
                }}
              >
                <span className="mono-meta text-[8px] sm:text-[9px] uppercase tracking-[0.24em] text-[#edeae4]/60">
                  INVITE ONLY ACCESS
                </span>

                <h1 className="display-heading text-base sm:text-xl text-[#edeae4] tracking-tight mt-1 mb-1">
                  THE VAULT
                </h1>

                <p className="mono-meta text-[8px] sm:text-[9px] uppercase tracking-[0.14em] text-[#edeae4]/55 mb-3">
                  Enter studio invite code to register
                </p>

                <div className="relative w-full">
                  <div
                    data-testid="vault-gate-asterisks"
                    className={`w-full h-9 sm:h-10 rounded-lg bg-[#050507] border flex items-center justify-center px-3 mono-meta text-base sm:text-lg tracking-[0.3em] transition-colors ${
                      activeError
                        ? "border-red-500 text-red-400"
                        : "border-white/20 text-[#edeae4]"
                    }`}
                  >
                    {maskedInviteAsterisks.length > 0 ? (
                      <span className="truncate">{maskedInviteAsterisks}</span>
                    ) : (
                      <span className="text-[9px] sm:text-[10px] tracking-[0.2em] text-[#edeae4]/35 uppercase">
                        INVITE CODE (********)
                      </span>
                    )}
                  </div>
                  <input
                    type="password"
                    required
                    aria-label="Vault Invite Code"
                    value={inviteCode}
                    onChange={(e) => {
                      setInviteCode(e.target.value);
                      if (inviteError) setInviteError(null);
                    }}
                    autoComplete="off"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-text"
                  />
                </div>

                {activeError && (
                  <div className="mono-meta text-[8px] sm:text-[9px] uppercase text-red-400 mt-1.5">
                    {activeError}
                  </div>
                )}

                <button
                  type="submit"
                  className="mt-3 px-4 py-1.5 rounded-full mono-meta text-[9px] sm:text-[10px] uppercase tracking-[0.2em] cursor-pointer transition border border-red-500/50 bg-red-600/90 hover:bg-red-500 text-white font-semibold shadow-md"
                >
                  VERIFY INVITE CODE ↵
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setInviteError(null);
                    onChangeMode("signin");
                    setGateStep("auth");
                  }}
                  className="mt-2.5 mono-meta text-[8px] sm:text-[9px] uppercase tracking-[0.14em] text-[#edeae4]/65 hover:text-white cursor-pointer transition"
                >
                  Already have an account? Sign In →
                </button>
              </form>
            ) : (
              <form
                onSubmit={(e) => void handleFormSubmit(e)}
                autoComplete="off"
                className="relative z-20 w-[268px] h-[268px] sm:w-[336px] sm:h-[336px] rounded-full flex flex-col items-center justify-center px-6 sm:px-8 text-center"
                style={{
                  background:
                    "radial-gradient(circle at 50% 30%, #1c1924 0%, #09080c 82%)",
                  border: unlocking
                    ? "3px solid #34d399"
                    : authError
                      ? "3px solid #ef4444"
                      : "3px solid rgba(220, 38, 38, 0.72)",
                  boxShadow:
                    "0 18px 44px rgba(0,0,0,0.92), inset 0 2px 8px rgba(255,255,255,0.14)",
                }}
              >
                <span className="mono-meta text-[8px] sm:text-[9px] uppercase tracking-[0.24em] text-[#edeae4]/60">
                  {unlocking ? "ACCESS GRANTED" : "BEAT STACKZ"}
                </span>

                <h1 className="display-heading text-base sm:text-xl text-[#edeae4] tracking-tight mt-0.5 mb-2">
                  THE VAULT
                </h1>

                {/* Sign In / Create Account Mode Switcher */}
                <div className="inline-flex rounded-full bg-white/10 p-0.5 border border-white/15 mb-2">
                  <button
                    type="button"
                    onClick={() => onChangeMode("signup")}
                    className={`px-2.5 py-0.5 rounded-full mono-meta text-[8px] sm:text-[9px] uppercase cursor-pointer transition ${
                      authMode === "signup"
                        ? "bg-[#edeae4] text-[#09080c] font-semibold"
                        : "text-[#edeae4]/70 hover:text-white"
                    }`}
                  >
                    Sign Up
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeMode("signin")}
                    className={`px-2.5 py-0.5 rounded-full mono-meta text-[8px] sm:text-[9px] uppercase cursor-pointer transition ${
                      authMode === "signin"
                        ? "bg-[#edeae4] text-[#09080c] font-semibold"
                        : "text-[#edeae4]/70 hover:text-white"
                    }`}
                  >
                    Sign In
                  </button>
                </div>

                {/* Inputs Stack Inside Vault Hub */}
                <div className="w-full space-y-1.5">
                  {authMode === "signup" && (
                    <input
                      type="text"
                      value={authName}
                      onChange={(e) => onChangeName(e.target.value)}
                      placeholder="Artist / Producer Name"
                      autoComplete="off"
                      className="w-full h-7 sm:h-8 rounded-lg bg-[#050507] border border-white/20 px-2.5 mono-meta text-[10px] sm:text-[11px] text-[#edeae4] placeholder:text-[#edeae4]/35 focus:outline-none focus:border-red-500 text-center"
                    />
                  )}

                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => onChangeEmail(e.target.value)}
                    placeholder="Email Address"
                    autoComplete="off"
                    className="w-full h-8 sm:h-9 rounded-lg bg-[#050507] border border-white/20 px-2.5 mono-meta text-[10px] sm:text-[11px] text-[#edeae4] placeholder:text-[#edeae4]/35 focus:outline-none focus:border-red-500 text-center"
                  />

                  {/* Password Box Displaying Literal '*' Characters */}
                  <div className="relative w-full">
                    <div
                      data-testid="vault-gate-asterisks"
                      className={`w-full h-8 sm:h-9 rounded-lg bg-[#050507] border flex items-center justify-center px-2.5 mono-meta text-sm sm:text-base tracking-[0.28em] transition-colors ${
                        unlocking
                          ? "border-emerald-400 text-emerald-300"
                          : authError
                            ? "border-red-500 text-red-400"
                            : "border-white/20 text-[#edeae4]"
                      }`}
                    >
                      {maskedAsterisks.length > 0 ? (
                        <span className="truncate">{maskedAsterisks}</span>
                      ) : (
                        <span className="text-[9px] sm:text-[10px] tracking-[0.18em] text-[#edeae4]/35 uppercase">
                          PASSWORD (********)
                        </span>
                      )}
                    </div>
                    <input
                      type="password"
                      required
                      aria-label="Vault Password"
                      value={authPassword}
                      onChange={(e) => onChangePassword(e.target.value)}
                      autoComplete="new-password"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-text"
                    />
                  </div>
                </div>

                {authError && (
                  <div className="mono-meta text-[8px] sm:text-[9px] uppercase text-red-400 mt-1 max-w-[210px] truncate">
                    {authError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={status !== "idle"}
                  className="mt-2.5 px-4 py-1.5 rounded-full mono-meta text-[9px] sm:text-[10px] uppercase tracking-[0.2em] cursor-pointer transition border border-red-500/50 bg-red-600/90 hover:bg-red-500 text-white font-semibold shadow-md"
                >
                  {unlocking
                    ? "OPENING VAULT..."
                    : status === "submitting"
                      ? "VERIFYING..."
                      : authMode === "signin"
                        ? "UNLOCK VAULT ↵"
                        : "CREATE & UNLOCK ↵"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setInviteError(null);
                    setGateStep("invite");
                  }}
                  className="mt-1.5 mono-meta text-[8px] uppercase tracking-[0.14em] text-[#edeae4]/45 hover:text-[#edeae4]/80 cursor-pointer"
                >
                  ← Invite Code
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Safe Wall Telemetry Plaque */}
      <div className="w-full max-w-5xl flex items-center justify-between z-10 px-4 sm:px-6 pb-2 mono-meta text-[9px] sm:text-[10px] uppercase tracking-[0.18em] text-[#edeae4]/50">
        <span>SWISH × TODO · STUDIO VAULT</span>
        <span>SIGN IN AT CENTER WHEEL TO UNLOCK</span>
      </div>
    </div>
  );
}
