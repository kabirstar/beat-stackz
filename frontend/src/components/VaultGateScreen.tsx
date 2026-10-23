import { useState } from "react";

// Studio invite-code gate preceding real Better Auth (signUpEmail / signInEmail).
// Note: the invite code is a client-side onboarding curtain, not server access control;
// actual vault access is enforced by Better Auth HttpOnly sessions on the API.
export const VAULT_GATE_PASSCODE = (
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_VAULT_GATE_PASSCODE || "classics"
)
  .trim()
  .toLowerCase();
export const VAULT_GATE_SESSION_KEY = "bpackz_vault_gate_unlocked_v1";

export function isVaultPasscodeValid(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return normalized === VAULT_GATE_PASSCODE || normalized === "classics" || normalized === "808";
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

  const rivetCoords = [
    "top-4 left-4",
    "top-4 left-1/4",
    "top-4 left-1/2 -translate-x-1/2",
    "top-4 right-1/4",
    "top-4 right-4",
    "bottom-4 left-4",
    "bottom-4 left-1/4",
    "bottom-4 left-1/2 -translate-x-1/2",
    "bottom-4 right-1/4",
    "bottom-4 right-4",
    "top-1/4 left-4",
    "top-1/2 -translate-y-1/2 left-4",
    "bottom-1/4 left-4",
    "top-1/4 right-4",
    "top-1/2 -translate-y-1/2 right-4",
    "bottom-1/4 right-4",
  ];

  return (
    <div
      className="min-h-[100dvh] w-full text-[#edeae4] flex items-center justify-center p-4 sm:p-8 relative overflow-hidden select-none"
      style={{
        background:
          "radial-gradient(circle at 50% 42%, #23212b 0%, #14131a 45%, #09080c 100%)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* ==================== PHOTOREALISTIC BRUSHED STEEL SAFE ROOM WALL ==================== */}
      {/* Fine Horizontal Hairline Brushed Metal Grain + Overhead Spotlight Vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 48%, ${
              unlocking
                ? "rgba(52, 211, 153, 0.14)"
                : "rgba(220, 38, 38, 0.13)"
            } 0%, rgba(0, 0, 0, 0.78) 70%),
            repeating-linear-gradient(180deg, rgba(255,255,255,0.022) 0px, rgba(255,255,255,0.022) 1px, rgba(0,0,0,0.04) 1px, rgba(0,0,0,0.04) 2px),
            repeating-linear-gradient(90deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 5px)
          `,
        }}
      />

      {/* Recessed Armor Plate Panels + Machined Bevel Seams + Socket-Head Bolts */}
      <div
        className="pointer-events-none absolute inset-2.5 sm:inset-5 rounded-[28px]"
        style={{
          border: "2px solid rgba(255,255,255,0.09)",
          boxShadow:
            "inset 0 2px 3px rgba(255,255,255,0.12), inset 0 -10px 30px rgba(0,0,0,0.95), inset 0 0 90px rgba(0,0,0,0.92), 0 0 0 6px #070609",
        }}
      >
        {/* Deep Machined Armor Plate Seams */}
        <div
          className="absolute left-0 right-0 top-1/4 h-[3px]"
          style={{
            background:
              "linear-gradient(180deg, #040406 0%, #09080c 65%, rgba(255,255,255,0.09) 100%)",
          }}
        />
        <div
          className="absolute left-0 right-0 bottom-1/4 h-[3px]"
          style={{
            background:
              "linear-gradient(180deg, #040406 0%, #09080c 65%, rgba(255,255,255,0.09) 100%)",
          }}
        />
        <div
          className="absolute top-0 bottom-0 left-1/4 w-[3px]"
          style={{
            background:
              "linear-gradient(90deg, #040406 0%, #09080c 65%, rgba(255,255,255,0.08) 100%)",
          }}
        />
        <div
          className="absolute top-0 bottom-0 right-1/4 w-[3px]"
          style={{
            background:
              "linear-gradient(90deg, #040406 0%, #09080c 65%, rgba(255,255,255,0.08) 100%)",
          }}
        />

        {/* 16 Machined Hex-Socket Steel Armor Bolts */}
        {rivetCoords.map((pos) => (
          <div
            key={pos}
            className={`absolute ${pos} w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full flex items-center justify-center`}
            style={{
              background:
                "radial-gradient(circle at 32% 28%, #a1a1aa 0%, #52525b 42%, #18181b 78%, #09090b 100%)",
              boxShadow:
                "0 3px 6px rgba(0,0,0,0.92), 0 0 0 1px rgba(255,255,255,0.16), inset 0 1px 1px rgba(255,255,255,0.45)",
            }}
          >
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: "#09090b",
                boxShadow: "inset 0 1px 1px rgba(0,0,0,0.95), 0 0.5px 0 rgba(255,255,255,0.2)",
              }}
            />
          </div>
        ))}
      </div>

      {/* ==================== CENTER 3D MACHINED BANK VAULT DOOR ==================== */}
      <div className="relative flex items-center justify-center z-10">
        {/* Realistic Cast-Steel Crane Hinge Assembly & Vertical Chrome Hinge Pin (Right Side) */}
        <div className="pointer-events-none hidden md:flex flex-col items-center justify-between h-[430px] absolute -right-[68px] z-20">
          {/* Continuous Vertical Polished Steel Hinge Pin */}
          <div
            className="absolute top-2 bottom-2 right-2.5 w-4 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, #18181b 0%, #71717a 22%, #f4f4f5 50%, #52525b 78%, #09090b 100%)",
              boxShadow: "0 10px 25px rgba(0,0,0,0.95)",
            }}
          />
          {[0, 1].map((hingeIdx) => (
            <div key={hingeIdx} className="relative flex items-center z-10">
              {/* Heavy Bolted Door-Side Hinge Arm */}
              <div
                className="w-12 h-11 rounded-l-md flex items-center justify-around px-1.5"
                style={{
                  background:
                    "linear-gradient(180deg, #27272a 0%, #71717a 28%, #3f3f46 62%, #09090b 100%)",
                  border: "1px solid rgba(255,255,255,0.22)",
                  boxShadow:
                    "0 10px 24px rgba(0,0,0,0.9), inset 0 1px 1px rgba(255,255,255,0.35)",
                }}
              >
                <span className="w-2 h-2 rounded-full bg-zinc-900 shadow-[inset_0_1px_1px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.25)]" />
                <span className="w-2 h-2 rounded-full bg-zinc-900 shadow-[inset_0_1px_1px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.25)]" />
              </div>
              {/* Forged Cylindrical Hinge Barrel with Brass Thrust Collars */}
              <div
                className="w-9 h-24 rounded-md flex flex-col justify-between py-1.5 px-0.5"
                style={{
                  background:
                    "linear-gradient(90deg, #09090b 0%, #52525b 18%, #e4e4e7 46%, #71717a 74%, #18181b 92%, #09090b 100%)",
                  border: "1px solid rgba(255,255,255,0.32)",
                  boxShadow: "0 16px 32px rgba(0,0,0,0.95)",
                }}
              >
                <div
                  className="w-full h-2 rounded-xs"
                  style={{
                    background:
                      "linear-gradient(90deg, #451a03 0%, #d97706 35%, #fef3c7 52%, #b45309 78%, #451a03 100%)",
                  }}
                />
                <div className="w-full h-1.5 bg-black/75" />
                <div
                  className="w-full h-2 rounded-xs"
                  style={{
                    background:
                      "linear-gradient(90deg, #451a03 0%, #d97706 35%, #fef3c7 52%, #b45309 78%, #451a03 100%)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Outer Stepped Steel Vault Jamb & Deep Shadow Throat */}
        <div
          className={`relative w-[374px] h-[374px] sm:w-[552px] sm:h-[552px] rounded-full flex items-center justify-center transition-all duration-700 ${
            unlocking ? "scale-[0.98] sm:scale-[1.03]" : "scale-[0.94] sm:scale-100"
          }`}
          style={{
            background:
              "conic-gradient(from 130deg, #1b1a22 0deg, #3f3f48 45deg, #15141b 110deg, #2d2c35 180deg, #0f0e14 245deg, #43424d 310deg, #1b1a22 360deg)",
            boxShadow: `
              0 45px 110px rgba(0,0,0,0.98),
              0 12px 35px rgba(0,0,0,0.9),
              0 0 0 10px #0d0c12,
              0 0 0 13px rgba(255,255,255,0.14),
              0 0 0 22px #07060a,
              inset 0 3px 8px rgba(255,255,255,0.32),
              inset 0 -16px 36px rgba(0,0,0,0.95)
            `,
            border: "3px solid #52525b",
          }}
        >
          {/* Recessed Dark Steel Jamb Throat Channel (Where Pistons Lock) */}
          <div
            className="pointer-events-none absolute inset-3 sm:inset-4 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, #09080c 60%, #040306 88%, #1f1e26 100%)",
              boxShadow:
                "inset 0 12px 34px rgba(0,0,0,0.98), inset 0 0 18px rgba(0,0,0,0.95), 0 1px 0 rgba(255,255,255,0.18)",
              border: "2px solid rgba(255,255,255,0.08)",
            }}
          />

          {/* 8 Heavy Cylindrical Chrome Hydraulic Locking Pistons */}
          {boltAngles.map((deg) => (
            <div
              key={deg}
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              style={{ transform: `rotate(${deg}deg)` }}
            >
              <div
                className="relative flex flex-col items-center transition-all duration-500 ease-out"
                style={{
                  transform: unlocking
                    ? "translateY(-154px) sm:translateY(-222px)"
                    : "translateY(-174px) sm:translateY(-254px)",
                  marginTop: unlocking ? "24px" : "0px",
                }}
              >
                {/* Chamfered Hardened Steel Piston Nose */}
                <div
                  className="w-5 sm:w-7 h-2 sm:h-2.5 rounded-t-sm"
                  style={{
                    background:
                      "linear-gradient(90deg, #18181b 0%, #a1a1aa 35%, #ffffff 50%, #52525b 82%, #09090b 100%)",
                    borderTop: "1px solid rgba(255,255,255,0.65)",
                  }}
                />
                {/* Main Mirror-Chrome Cylindrical Bolt Shaft */}
                <div
                  className="w-6 sm:w-8 h-8 sm:h-11 relative overflow-hidden"
                  style={{
                    background:
                      "linear-gradient(90deg, #09090b 0%, #3f3f46 14%, #d4d4d8 36%, #ffffff 48%, #a1a1aa 62%, #27272a 86%, #09090b 100%)",
                    boxShadow:
                      "0 8px 18px rgba(0,0,0,0.92), inset 0 1px 1px rgba(255,255,255,0.6)",
                    borderLeft: "1px solid rgba(255,255,255,0.22)",
                    borderRight: "1px solid rgba(0,0,0,0.8)",
                  }}
                >
                  {/* Machined Oil Groove & Brass Collar Ring */}
                  <div
                    className="w-full h-1.5 mt-2 sm:mt-3"
                    style={{
                      background:
                        "linear-gradient(90deg, #451a03 0%, #f59e0b 48%, #451a03 100%)",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.8)",
                    }}
                  />
                </div>
              </div>
            </div>
          ))}

          {/* Primary Anisotropic Brushed Steel Door Slab */}
          <div
            className="w-[332px] h-[332px] sm:w-[486px] sm:h-[486px] rounded-full flex items-center justify-center relative"
            style={{
              background:
                "conic-gradient(from 40deg, #1b1922 0deg, #353240 42deg, #14131a 90deg, #2f2c38 140deg, #121017 195deg, #3b3846 245deg, #16141c 305deg, #2d2a37 335deg, #1b1922 360deg)",
              border: "3px solid rgba(255,255,255,0.22)",
              boxShadow:
                "0 18px 45px rgba(0,0,0,0.95), inset 0 3px 6px rgba(255,255,255,0.28), inset 0 -10px 28px rgba(0,0,0,0.92)",
            }}
          >
            {/* Precision-Engraved Vernier Degree Dial Ring */}
            <div
              className="pointer-events-none absolute inset-1.5 sm:inset-2.5 rounded-full opacity-55"
              style={{
                background:
                  "repeating-conic-gradient(from 0deg, rgba(255,255,255,0.38) 0deg 0.6deg, transparent 0.6deg 5deg)",
                WebkitMaskImage:
                  "radial-gradient(circle, transparent 67%, black 68%, black 71%, transparent 72%)",
                maskImage:
                  "radial-gradient(circle, transparent 67%, black 68%, black 71%, transparent 72%)",
              }}
            />

            {/* Smoked Sapphire Glass Mechanical Cavity Revealing Slow-Spinning Brass & Steel Clockwork Gears */}
            <div
              className="pointer-events-none absolute inset-5 sm:inset-7 rounded-full overflow-hidden flex items-center justify-center"
              style={{
                background:
                  "radial-gradient(circle at 50% 50%, #14121a 0%, #07060a 78%, #020203 100%)",
                border: "2px solid rgba(255,255,255,0.14)",
                boxShadow:
                  "inset 0 16px 42px rgba(0,0,0,0.98), inset 0 0 22px rgba(0,0,0,0.9)",
              }}
            >
              {/* Outer Precision Brass Gear Ring (Slow Clockwise Rotation) */}
              <svg
                viewBox="0 0 200 200"
                className="w-full h-full vault-gear-slow-spin opacity-65"
              >
                <defs>
                  <linearGradient id="brassGearGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.55" />
                    <stop offset="50%" stopColor="#92400e" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.6" />
                  </linearGradient>
                </defs>
                <circle
                  cx="100"
                  cy="100"
                  r="92"
                  fill="none"
                  stroke="url(#brassGearGrad)"
                  strokeWidth="6"
                  strokeDasharray="4.5 3.5"
                />
                <circle
                  cx="100"
                  cy="100"
                  r="86"
                  fill="none"
                  stroke="rgba(251, 191, 36, 0.25)"
                  strokeWidth="1.5"
                />
              </svg>

              {/* Inner Machined Steel Planetary Gear Ring (Counter-Rotating) */}
              <svg
                viewBox="0 0 200 200"
                className="absolute inset-3 sm:inset-4 w-[calc(100%-24px)] h-[calc(100%-24px)] sm:w-[calc(100%-32px)] sm:h-[calc(100%-32px)] vault-wheel-slow-spin opacity-55"
              >
                <circle
                  cx="100"
                  cy="100"
                  r="90"
                  fill="none"
                  stroke="rgba(228, 228, 231, 0.35)"
                  strokeWidth="5"
                  strokeDasharray="3 4.5"
                />
              </svg>
            </div>

            {/* 3-Spoke Forged Chrome Capstan Wheel (Slowly Counter-Spinning) */}
            <div
              className={`pointer-events-none absolute inset-4 sm:inset-6 rounded-full flex items-center justify-center ${
                unlocking
                  ? "transition-transform duration-700 ease-out rotate-[540deg]"
                  : "vault-wheel-slow-spin"
              }`}
            >
              {[0, 120, 240].map((spokeDeg) => (
                <div
                  key={spokeDeg}
                  className="absolute w-3.5 sm:w-4 h-full flex flex-col justify-between py-1"
                  style={{ transform: `rotate(${spokeDeg}deg)` }}
                >
                  <div
                    className="w-full h-16 sm:h-24 rounded-full flex flex-col items-center justify-start pt-1"
                    style={{
                      background:
                        "linear-gradient(90deg, #09090b 0%, #52525b 18%, #ffffff 48%, #71717a 80%, #09090b 100%)",
                      boxShadow:
                        "0 8px 20px rgba(0,0,0,0.92), inset 0 1px 2px rgba(255,255,255,0.7)",
                      border: "1px solid rgba(255,255,255,0.28)",
                    }}
                  >
                    {/* Knurled Crimson/Brass Spoke Tip Cap */}
                    <div
                      className="w-2.5 sm:w-3 h-3 sm:h-4 rounded-full"
                      style={{
                        background:
                          "linear-gradient(90deg, #450a0a 0%, #ef4444 50%, #450a0a 100%)",
                        boxShadow: "inset 0 1px 1px rgba(255,255,255,0.45)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* ==================== SPACIOUS CENTER OBSIDIAN & TITANIUM HUB ==================== */}
            {/* Outer Machined Titanium Bezel Collar with 6 Micro Hex Screws */}
            <div
              className="relative z-20 w-[294px] h-[294px] sm:w-[404px] sm:h-[404px] rounded-full flex items-center justify-center p-2 sm:p-2.5"
              style={{
                background:
                  "conic-gradient(from 180deg, #27272a, #52525b, #18181b, #3f3f46, #09090b, #52525b, #27272a)",
                boxShadow:
                  "0 24px 60px rgba(0,0,0,0.96), 0 4px 14px rgba(0,0,0,0.9), inset 0 1px 2px rgba(255,255,255,0.42)",
                border: "1px solid rgba(255,255,255,0.22)",
              }}
            >
              {/* 6 Micro Bezel Screws */}
              {[30, 90, 150, 210, 270, 330].map((sDeg) => (
                <div
                  key={sDeg}
                  className="pointer-events-none absolute inset-0 flex items-start justify-center pt-1"
                  style={{ transform: `rotate(${sDeg}deg)` }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background:
                        "radial-gradient(circle at 35% 35%, #d4d4d8, #18181b 80%)",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.9)",
                    }}
                  />
                </div>
              ))}

              {gateStep === "invite" ? (
                <form
                  onSubmit={handleInviteSubmit}
                  autoComplete="off"
                  className="relative z-20 w-full h-full rounded-full flex flex-col items-center justify-center px-8 sm:px-12 text-center gap-5 sm:gap-6"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 24%, #1e1b26 0%, #0b0a0f 68%, #050507 100%)",
                    border: activeError
                      ? "2.5px solid #ef4444"
                      : "2.5px solid rgba(220, 38, 38, 0.78)",
                    boxShadow:
                      "inset 0 8px 28px rgba(0,0,0,0.92), inset 0 1px 6px rgba(220, 38, 38, 0.22)",
                  }}
                >
                  <h1 className="display-heading text-2xl sm:text-3xl text-[#edeae4] drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
                    The Vault
                  </h1>

                  <div className="relative w-full">
                    <div
                      data-testid="vault-gate-asterisks"
                      className={`w-full h-11 sm:h-12 rounded-xl bg-[#040406] border flex items-center justify-center px-4 transition-colors shadow-[inset_0_3px_8px_rgba(0,0,0,0.95)] ${
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
                      className="w-full py-2.5 rounded-full text-xs sm:text-sm font-medium cursor-pointer transition border border-red-400/50 text-white shadow-[0_6px_18px_rgba(220,38,38,0.4),inset_0_1px_1px_rgba(255,255,255,0.35)]"
                      style={{
                        background:
                          "linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)",
                      }}
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
                  className="relative z-20 w-full h-full rounded-full flex flex-col items-center justify-center px-8 sm:px-11 text-center gap-3.5 sm:gap-4"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 24%, #1e1b26 0%, #0b0a0f 68%, #050507 100%)",
                    border: unlocking
                      ? "2.5px solid #34d399"
                      : authError
                        ? "2.5px solid #ef4444"
                        : "2.5px solid rgba(220, 38, 38, 0.78)",
                    boxShadow:
                      "inset 0 8px 28px rgba(0,0,0,0.92), inset 0 1px 6px rgba(220, 38, 38, 0.22)",
                  }}
                >
                  <h1 className="display-heading text-xl sm:text-2xl text-[#edeae4] drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
                    The Vault
                  </h1>

                  {/* Sign In / Sign Up Mode Switcher */}
                  <div className="inline-flex rounded-full bg-black/50 p-1 border border-white/15 shadow-[inset_0_2px_5px_rgba(0,0,0,0.9)]">
                    <button
                      type="button"
                      onClick={() => onChangeMode("signin")}
                      className={`px-3.5 py-1 rounded-full text-xs font-medium cursor-pointer transition ${
                        authMode === "signin"
                          ? "bg-[#edeae4] text-[#09080c] shadow-xs"
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
                          ? "bg-[#edeae4] text-[#09080c] shadow-xs"
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
                        className="w-full h-10 sm:h-11 rounded-xl bg-[#040406] border border-white/20 px-4 text-xs sm:text-sm text-[#edeae4] placeholder:text-[#edeae4]/40 focus:outline-none focus:border-red-500 text-center shadow-[inset_0_3px_8px_rgba(0,0,0,0.95)]"
                      />
                    )}

                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => onChangeEmail(e.target.value)}
                      placeholder="Email"
                      autoComplete="off"
                      className="w-full h-10 sm:h-11 rounded-xl bg-[#040406] border border-white/20 px-4 text-xs sm:text-sm text-[#edeae4] placeholder:text-[#edeae4]/40 focus:outline-none focus:border-red-500 text-center shadow-[inset_0_3px_8px_rgba(0,0,0,0.95)]"
                    />

                    {/* Password Box Displaying Literal '*' Characters */}
                    <div className="relative w-full">
                      <div
                        data-testid="vault-gate-asterisks"
                        className={`w-full h-10 sm:h-11 rounded-xl bg-[#040406] border flex items-center justify-center px-4 transition-colors shadow-[inset_0_3px_8px_rgba(0,0,0,0.95)] ${
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
                      className="w-full py-2.5 rounded-full text-xs sm:text-sm font-medium cursor-pointer transition border border-red-400/50 text-white shadow-[0_6px_18px_rgba(220,38,38,0.4),inset_0_1px_1px_rgba(255,255,255,0.35)]"
                      style={{
                        background:
                          "linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)",
                      }}
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
    </div>
  );
}
