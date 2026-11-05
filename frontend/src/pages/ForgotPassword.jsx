import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

// Two steps: 1) email -> we send a 6-digit PIN, 2) PIN + new password -> password changed.
const inputClass =
  "w-full bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-4 py-3 rounded-xl focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-colors";
const labelClass = "text-xs font-mono font-semibold text-[var(--text-secondary)] uppercase tracking-wider";

function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState("email"); // email | reset | done
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendPin = async (e) => {
    e?.preventDefault();
    if (!email.trim() || cooldown > 0) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/auth/forgot-password", { email: email.trim() });
      setInfo(res.data?.message || "If an account exists for that email, a reset PIN has been sent.");
      setStep("reset");
      setCooldown(30);
    } catch (err) {
      setError(
        err.response?.status === 429
          ? "Too many requests. Please wait a minute and try again."
          : err.response?.data?.detail || "Couldn't send the PIN. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    setError("");
    if (pin.length !== 6) return setError("Enter the 6-digit PIN from the email.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { email: email.trim(), pin, new_password: password });
      setStep("done");
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid or expired PIN.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-canvas-gradient)] text-[var(--text-primary)] flex justify-center items-center p-4 md:p-8 font-sans">
      <div className="w-full max-w-[460px] auvon-card shadow-2xl bg-[var(--bg-surface)] flex flex-col gap-6">
        <div>
          <span className="text-xl font-bold tracking-tight font-heading">
            Auvon <span className="text-[var(--accent-primary)] font-semibold">ai</span>
          </span>
          <h1 className="text-2xl font-bold tracking-tight font-heading mt-4">
            {step === "done" ? "Password updated" : "Reset your password"}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {step === "email" && "Enter your account email. We'll send you a 6-digit PIN."}
            {step === "reset" && (
              <>
                {info} Check <span className="font-semibold text-[var(--text-primary)] break-all">{email}</span> (and spam).
              </>
            )}
            {step === "done" && "You can now sign in with your new password."}
          </p>
        </div>

        {step === "email" && (
          <form onSubmit={sendPin} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Email Address</span>
              <input type="email" required autoFocus placeholder="name@university.edu" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </label>
            {error && <p className="text-xs text-red-500 font-mono">{error}</p>}
            <button type="submit" disabled={loading} className="auvon-pill-btn-primary w-full py-3.5 text-sm font-semibold cursor-pointer disabled:opacity-50">
              {loading ? "Sending…" : "Send reset PIN →"}
            </button>
          </form>
        )}

        {step === "reset" && (
          <form onSubmit={resetPassword} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>6-digit PIN</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                placeholder="000000"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
                className={`${inputClass} text-center tracking-[0.5em] text-2xl font-bold`}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>New Password</span>
              <input type="password" autoComplete="new-password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Confirm Password</span>
              <input type="password" autoComplete="new-password" placeholder="Type it again" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
            </label>
            {error && <p className="text-xs text-red-500 font-mono">{error}</p>}
            <button type="submit" disabled={loading} className="auvon-pill-btn-primary w-full py-3.5 text-sm font-semibold cursor-pointer disabled:opacity-50">
              {loading ? "Updating…" : "Set new password"}
            </button>
            <div className="text-xs text-[var(--text-secondary)] text-center">
              Didn't get it?{" "}
              {cooldown > 0 ? (
                <span className="text-[var(--text-muted)]">Resend in {cooldown}s</span>
              ) : (
                <button type="button" onClick={sendPin} className="text-[var(--accent-primary)] font-semibold hover:underline cursor-pointer">
                  Send a new PIN
                </button>
              )}
            </div>
          </form>
        )}

        {step === "done" && (
          <button type="button" onClick={() => navigate("/login")} className="auvon-pill-btn-primary w-full py-3.5 text-sm font-semibold cursor-pointer">
            Go to sign in →
          </button>
        )}

        {step !== "done" && (
          <button type="button" onClick={() => navigate("/login")} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline cursor-pointer self-center">
            ← Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}

export default ForgotPassword;
