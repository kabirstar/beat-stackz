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
      setInviteError("Invalid code");
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
      className="min-h-[100dvh] w-full text-[#edeae4] flex items-center justify-center p-4 sm:p-8 relative overflow-hidden select-none"
      style={{
        background:
          "linear-gradient(145deg, #16151c 0%, #0d0c11 45%, #15131b 75%, #09080c 100%)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* ==================== SAFE WALL BACKGROUND (PURE HARDWARE, ZERO TEXT CLUTTER) ==================== */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 50%, rgba(220, 38, 38, 0.12) 0%, rgba(0, 0, 0, 0.68) 72%), repeating-linear-gradient(90deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 1px, transparent 1px, transparent 4px)",
        }}
      />

      {/* Recessed Steel Safe Wall Frame + Welded Armor Seams + Perimeter Rivets */}
      <div className="pointer-events-none absolute inset-3 sm:inset-6 rounded-3xl border-2 border-white/10 shadow-[inset_0_0_60px_rgba(0,0,0,0.9)]">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-black/80 border-b border-white/10" />
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-black/80 border-r border-white/10" />

        {[
          "top-4 left-4",
          "top-4 left-1/4",
          "top-4 right-1/4",
          "top-4 right-4",
          "bottom-4 left-4",
          "bottom-4 left-1/4",
          "bottom-4 right-1/4",
          "bottom-4 right-4",
          "top-1/4 left-4",
          "bottom-1/4 left-4",
          "top-1/4 right-4",
          "bottom-1/4 right-4",
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

      {/* ==================== CENTER 3D CIRCULAR BANK VAULT DOOR ==================== */}
      <div className="relative flex items-center justify-center z-10">
        {/* Heavy Forged Steel Vault Hinges Mounted to the Right Safe Wall */}
        <div className="pointer-events-none hidden md:flex flex-col justify-between h-[360px] absolute -right-14 z-20">
          {[0, 1].map((hingeIdx) => (
            <div key={hingeIdx} className="flex items-center">
              <div
                className="w-10 h-8 rounded-l-md border-y border-l border-white/25"
                style={{
                  background: "linear-gradient(180deg, #3f3f46 0%, #71717a 45%, #18181b 100%)",
                  boxShadow: "0 8px 20px rgba(0,0,0,0.8)",
                }}
              />
              <div
                className="w-7 h-22 rounded-md border border-white/30 flex flex-col justify-between p-1"
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

        {/* Outer Recessed Steel Door Jamb */}
        <div
          className={`relative w-[370px] h-[370px] sm:w-[530px] sm:h-[530px] rounded-full flex items-center justify-center transition-all duration-700 ${
            unlocking ? "scale-[0.98] sm:scale-[1.04]" : "scale-[0.94] sm:scale-100"
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
                    ? "translateY(-155px) sm:translateY(-220px)"
                    : "translateY(-180px) sm:translateY(-255px)",
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
            className="w-[330px] h-[330px] sm:w-[468px] sm:h-[468px] rounded-full flex items-center justify-center relative"
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

            {/* ==================== SPACIOUS CENTER VAULT HUB ==================== */}
            {gateStep === "invite" ? (
              <form
                onSubmit={handleInviteSubmit}
                autoComplete="off"
                className="relative z-20 w-[288px] h-[288px] sm:w-[392px] sm:h-[392px] rounded-full flex flex-col items-center justify-center px-8 sm:px-12 text-center gap-5 sm:gap-6"
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
                <h1 className="display-heading text-2xl sm:text-3xl text-[#edeae4]">
                  The Vault
                </h1>

                <div className="relative w-full">
                  <div
                    data-testid="vault-gate-asterisks"
                    className={`w-full h-11 sm:h-12 rounded-xl bg-[#050507] border flex items-center justify-center px-4 transition-colors ${
                      activeError
                        ? "border-red-500 text-red-400"
                        : "border-white/20 text-[#edeae4]"
                    }`}
                  >
                    {maskedInviteAsterisks.length > 0 ? (
                      <span className="mono-meta text-lg sm:text-xl tracking-[0.32em] truncate">
                        {maskedInviteAsterisks}
                      </span>
                    ) : (
                      <span className="text-xs sm:text-sm text-[#edeae4]/40">
                        Invite code
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
                  <div className="text-xs text-red-400 -my-2">
                    {activeError}
                  </div>
                )}

                <div className="flex flex-col items-center gap-3 w-full">
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-full text-xs sm:text-sm font-medium cursor-pointer transition border border-red-500/50 bg-red-600/90 hover:bg-red-500 text-white shadow-md"
                  >
                    Enter
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInviteError(null);
                      onChangeMode("signin");
                      setGateStep("auth");
                    }}
                    className="text-xs text-[#edeae4]/60 hover:text-white cursor-pointer transition"
                  >
                    Sign in
                  </button>
                </div>
              </form>
            ) : (
              <form
                onSubmit={(e) => void handleFormSubmit(e)}
                autoComplete="off"
                className="relative z-20 w-[288px] h-[288px] sm:w-[392px] sm:h-[392px] rounded-full flex flex-col items-center justify-center px-8 sm:px-11 text-center gap-3.5 sm:gap-4"
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
                <h1 className="display-heading text-xl sm:text-2xl text-[#edeae4]">
                  The Vault
                </h1>

                {/* Sign In / Sign Up Mode Switcher */}
                <div className="inline-flex rounded-full bg-white/10 p-1 border border-white/15">
                  <button
                    type="button"
                    onClick={() => onChangeMode("signin")}
                    className={`px-3.5 py-1 rounded-full text-xs font-medium cursor-pointer transition ${
                      authMode === "signin"
                        ? "bg-[#edeae4] text-[#09080c]"
                        : "text-[#edeae4]/70 hover:text-white"
                    }`}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeMode("signup")}
                    className={`px-3.5 py-1 rounded-full text-xs font-medium cursor-pointer transition ${
                      authMode === "signup"
                        ? "bg-[#edeae4] text-[#09080c]"
                        : "text-[#edeae4]/70 hover:text-white"
                    }`}
                  >
                    Sign up
                  </button>
                </div>

                {/* Spaced-Out Inputs Inside Vault Hub (Zero Default Credentials) */}
                <div className="w-full flex flex-col gap-2.5 sm:gap-3">
                  {authMode === "signup" && (
                    <input
                      type="text"
                      value={authName}
                      onChange={(e) => onChangeName(e.target.value)}
                      placeholder="Name"
                      autoComplete="off"
                      className="w-full h-10 sm:h-11 rounded-xl bg-[#050507] border border-white/20 px-4 text-xs sm:text-sm text-[#edeae4] placeholder:text-[#edeae4]/40 focus:outline-none focus:border-red-500 text-center"
                    />
                  )}

                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => onChangeEmail(e.target.value)}
                    placeholder="Email"
                    autoComplete="off"
                    className="w-full h-10 sm:h-11 rounded-xl bg-[#050507] border border-white/20 px-4 text-xs sm:text-sm text-[#edeae4] placeholder:text-[#edeae4]/40 focus:outline-none focus:border-red-500 text-center"
                  />

                  {/* Password Box Displaying Literal '*' Characters */}
                  <div className="relative w-full">
                    <div
                      data-testid="vault-gate-asterisks"
                      className={`w-full h-10 sm:h-11 rounded-xl bg-[#050507] border flex items-center justify-center px-4 transition-colors ${
                        unlocking
                          ? "border-emerald-400 text-emerald-300"
                          : authError
                            ? "border-red-500 text-red-400"
                            : "border-white/20 text-[#edeae4]"
                      }`}
                    >
                      {maskedAsterisks.length > 0 ? (
                        <span className="mono-meta text-base sm:text-lg tracking-[0.3em] truncate">
                          {maskedAsterisks}
                        </span>
                      ) : (
                        <span className="text-xs sm:text-sm text-[#edeae4]/40">
                          Password
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
                  <div className="text-xs text-red-400 -my-1 max-w-[230px] truncate">
                    {authError}
                  </div>
                )}

                <div className="flex flex-col items-center gap-2 w-full">
                  <button
                    type="submit"
                    disabled={status !== "idle"}
                    className="w-full py-2.5 rounded-full text-xs sm:text-sm font-medium cursor-pointer transition border border-red-500/50 bg-red-600/90 hover:bg-red-500 text-white shadow-md"
                  >
                    {unlocking
                      ? "Opening..."
                      : status === "submitting"
                        ? "..."
                        : authMode === "signin"
                          ? "Sign in"
                          : "Create account"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInviteError(null);
                      setGateStep("invite");
                    }}
                    className="text-[11px] text-[#edeae4]/50 hover:text-white cursor-pointer transition"
                  >
                    Invite code
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
