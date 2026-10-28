import { useState } from "react";

// Studio invite-code gate preceding real Better Auth (signUpEmail / signInEmail).
// Per ADR 0003 (T082), the server enforces INVITE_CODE on POST /auth/sign-up/email;
// this helper remains exported for unit tests and local mock preview compatibility.
export const VAULT_GATE_PASSCODE = (
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_VAULT_GATE_PASSCODE || "swish"
)
  .trim()
  .toLowerCase();
export const VAULT_GATE_SESSION_KEY = "bpackz_vault_gate_unlocked_v1";
export const VAULT_KEEP_SIGNED_IN_KEY = "bpackz_vault_keep_signed_in_v1";

export function isVaultPasscodeValid(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return (
    normalized === VAULT_GATE_PASSCODE ||
    normalized === "swish" ||
    normalized === "808" ||
    normalized === "classics"
  );
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
  inviteCode?: string;
  rememberMe?: boolean;
  onChangeMode: (mode: "signin" | "signup") => void;
  onChangeName: (name: string) => void;
  onChangeEmail: (email: string) => void;
  onChangePassword: (password: string) => void;
  onChangeInviteCode?: (code: string) => void;
  onChangeRememberMe?: (remember: boolean) => void;
  onSubmitAuth: (
    e: React.FormEvent,
    inviteCode?: string,
    rememberMe?: boolean,
  ) => Promise<boolean> | boolean;
  onUnlock: (rememberMe?: boolean) => void;
}

export function VaultGateScreen({
  authMode,
  authName,
  authEmail,
  authPassword,
  authError,
  inviteCode: controlledInviteCode,
  rememberMe: controlledRememberMe,
  onChangeMode,
  onChangeName,
  onChangeEmail,
  onChangePassword,
  onChangeInviteCode,
  onChangeRememberMe,
  onSubmitAuth,
  onUnlock,
}: VaultGateScreenProps) {
  const [gateStep, setGateStep] = useState<"invite" | "auth">("invite");
  const [localInviteCode, setLocalInviteCode] = useState("");
  const [localRememberMe, setLocalRememberMe] = useState<boolean>(true);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "unlocking">("idle");
  const [shakeKey, setShakeKey] = useState(0);

  const inviteCode = controlledInviteCode ?? localInviteCode;
  const rememberMe = controlledRememberMe ?? localRememberMe;

  const setInviteCode = (val: string) => {
    setLocalInviteCode(val);
    onChangeInviteCode?.(val);
  };

  const setRememberMe = (val: boolean) => {
    setLocalRememberMe(val);
    onChangeRememberMe?.(val);
  };

  const triggerSeamlessUnlock = () => {
    setStatus("unlocking");
    window.setTimeout(() => {
      onUnlock(rememberMe);
    }, 520);
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isVaultPasscodeValid(inviteCode)) {
      setInviteError(null);
      onChangeMode("signup");
      setGateStep("auth");
    } else {
      setInviteError("Invite code not recognized");
      setShakeKey((k) => k + 1);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status !== "idle") return;
    setStatus("submitting");
    const ok = await onSubmitAuth(e, inviteCode.trim() || "swish", rememberMe);
    if (ok) {
      triggerSeamlessUnlock();
    } else {
      setStatus("idle");
      setShakeKey((k) => k + 1);
    }
  };

  const maskedInviteAsterisks = maskWithAsterisks(inviteCode);
  const maskedAsterisks = maskWithAsterisks(authPassword);
  const unlocking = status === "unlocking";
  const activeError = gateStep === "invite" ? inviteError : authError;

  return (
    <div
      className={`min-h-[100dvh] w-full flex flex-col items-center justify-center px-5 py-10 relative overflow-hidden select-none transition-colors duration-500 ease-out ${
        unlocking ? "bg-[#edeae4]" : "bg-[#ffffff]"
      }`}
      style={{
        color: "var(--ink)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Subtle Radial Studio Aura That Harmonizes White -> Main Page Warm Paper */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
          unlocking ? "opacity-100" : "opacity-45"
        }`}
        style={{
          background:
            "radial-gradient(circle at 50% 38%, rgba(237, 234, 228, 0.55) 0%, rgba(255, 255, 255, 0) 70%)",
        }}
      />

      {/* Centered Content Column */}
      <div
        className={`relative z-10 w-full max-w-[400px] flex flex-col items-center text-center transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          unlocking
            ? "-translate-y-8 scale-[0.98] opacity-0"
            : "translate-y-0 scale-100 opacity-100"
        }`}
      >
        {/* Website Hero Title ("The Vault") in the Middle */}
        <h1
          className={`display-heading text-5xl sm:text-7xl text-[#16132b] tracking-tight mb-8 sm:mb-10 vault-title-enter transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            unlocking ? "-translate-y-6 scale-95" : ""
          }`}
        >
          The Vault
        </h1>

        {/* Animated Login Card Container */}
        <div
          key={`${gateStep}-${shakeKey}`}
          className={`w-full rounded-3xl bg-white border border-[#16132b]/12 p-6 sm:p-7 shadow-[0_20px_50px_rgba(22,19,43,0.06)] transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] vault-step-enter ${
            activeError ? "vault-error-shake" : ""
          }`}
        >
          {gateStep === "invite" ? (
            <form
              onSubmit={handleInviteSubmit}
              autoComplete="off"
              className="w-full flex flex-col items-center gap-4"
            >
              {/* Invite Code Box (Masks Characters as '*') */}
              <div className="relative w-full">
                <div
                  data-testid="vault-gate-asterisks"
                  className={`w-full h-12 sm:h-13 rounded-2xl bg-[#faf9f6] border flex items-center justify-center px-4 transition-all duration-200 ${
                    activeError
                      ? "border-red-500 text-red-600 bg-red-50/30"
                      : "border-[#16132b]/15 text-[#16132b] focus-within:border-[#16132b] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(22,19,43,0.05)]"
                  }`}
                >
                  {maskedInviteAsterisks.length > 0 ? (
                    <span className="mono-meta text-lg sm:text-xl tracking-[0.32em] truncate pt-0.5">
                      {maskedInviteAsterisks}
                    </span>
                  ) : (
                    <span className="text-sm text-[#16132b]/40">
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
                <div className="text-xs font-medium text-red-600 -my-1">
                  {activeError}
                </div>
              )}

              <button
                type="submit"
                className="w-full h-12 rounded-2xl bg-[#16132b] hover:bg-[#16132b]/90 active:scale-[0.99] text-[#faf9f6] text-sm font-medium cursor-pointer transition-all duration-200 shadow-[0_8px_20px_rgba(22,19,43,0.14)]"
              >
                Continue
              </button>

              <button
                type="button"
                onClick={() => {
                  setInviteError(null);
                  onChangeMode("signin");
                  setGateStep("auth");
                }}
                className="text-xs font-medium text-[#16132b]/55 hover:text-[#16132b] cursor-pointer transition-colors pt-1"
              >
                Sign in
              </button>
            </form>
          ) : (
            <form
              onSubmit={(e) => void handleFormSubmit(e)}
              autoComplete="off"
              className="w-full flex flex-col items-center gap-4"
            >
              {/* Animated Sliding Pill Switcher (Sign in / Sign up) */}
              <div className="relative grid grid-cols-2 w-full rounded-2xl bg-[#f4f2ed] p-1 border border-[#16132b]/10">
                <div
                  className={`pointer-events-none absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-white shadow-[0_2px_8px_rgba(22,19,43,0.08)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    authMode === "signup" ? "translate-x-full left-1" : "translate-x-0 left-1"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => onChangeMode("signin")}
                  className={`relative z-10 py-2 rounded-xl text-xs sm:text-sm font-medium cursor-pointer transition-colors duration-200 ${
                    authMode === "signin"
                      ? "text-[#16132b]"
                      : "text-[#16132b]/55 hover:text-[#16132b]"
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => onChangeMode("signup")}
                  className={`relative z-10 py-2 rounded-xl text-xs sm:text-sm font-medium cursor-pointer transition-colors duration-200 ${
                    authMode === "signup"
                      ? "text-[#16132b]"
                      : "text-[#16132b]/55 hover:text-[#16132b]"
                  }`}
                >
                  Sign up
                </button>
              </div>

              {/* Clean Login Boxes */}
              <div className="w-full flex flex-col gap-3">
                {authMode === "signup" && (
                  <div className="vault-field-enter">
                    <input
                      type="text"
                      value={authName}
                      onChange={(e) => onChangeName(e.target.value)}
                      placeholder="Name"
                      autoComplete="off"
                      className="w-full h-12 rounded-2xl bg-[#faf9f6] border border-[#16132b]/15 px-4 text-sm text-[#16132b] placeholder:text-[#16132b]/40 focus:outline-none focus:border-[#16132b] focus:bg-white focus:shadow-[0_0_0_4px_rgba(22,19,43,0.05)] transition-all duration-200 text-center"
                    />
                  </div>
                )}

                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => onChangeEmail(e.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                  className="w-full h-12 rounded-2xl bg-[#faf9f6] border border-[#16132b]/15 px-4 text-sm text-[#16132b] placeholder:text-[#16132b]/40 focus:outline-none focus:border-[#16132b] focus:bg-white focus:shadow-[0_0_0_4px_rgba(22,19,43,0.05)] transition-all duration-200 text-center"
                />

                {/* Password Box Displaying Literal '*' Characters */}
                <div className="relative w-full">
                  <div
                    data-testid="vault-gate-asterisks"
                    className={`w-full h-12 rounded-2xl bg-[#faf9f6] border flex items-center justify-center px-4 transition-all duration-200 ${
                      authError
                        ? "border-red-500 text-red-600 bg-red-50/30"
                        : "border-[#16132b]/15 text-[#16132b] focus-within:border-[#16132b] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(22,19,43,0.05)]"
                    }`}
                  >
                    {maskedAsterisks.length > 0 ? (
                      <span className="mono-meta text-base sm:text-lg tracking-[0.3em] truncate pt-0.5">
                        {maskedAsterisks}
                      </span>
                    ) : (
                      <span className="text-sm text-[#16132b]/40">
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
                    autoComplete="current-password"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-text"
                  />
                </div>
              </div>

              {/* Keep Me Signed In Toggle */}
              <label className="inline-flex items-center gap-2.5 cursor-pointer select-none py-0.5 group">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="sr-only"
                />
                <span
                  className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all duration-200 ${
                    rememberMe
                      ? "bg-[#16132b] border-[#16132b] text-white"
                      : "bg-[#faf9f6] border-[#16132b]/25 group-hover:border-[#16132b]/50"
                  }`}
                >
                  {rememberMe && (
                    <svg
                      viewBox="0 0 12 12"
                      fill="none"
                      className="w-2.5 h-2.5 stroke-current"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2.5 6.2L5 8.7L9.5 3.5" />
                    </svg>
                  )}
                </span>
                <span className="text-xs font-medium text-[#16132b]/65 group-hover:text-[#16132b] transition-colors">
                  Keep me signed in
                </span>
              </label>

              {authError && (
                <div className="text-xs font-medium text-red-600 -my-1 max-w-[280px] truncate">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={status !== "idle"}
                className="w-full h-12 rounded-2xl bg-[#16132b] hover:bg-[#16132b]/90 active:scale-[0.99] disabled:opacity-60 text-[#faf9f6] text-sm font-medium cursor-pointer transition-all duration-200 shadow-[0_8px_20px_rgba(22,19,43,0.14)]"
              >
                {unlocking
                  ? "Entering..."
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
                className="text-xs font-medium text-[#16132b]/50 hover:text-[#16132b] cursor-pointer transition-colors pt-0.5"
              >
                Invite code
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
