import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

function VerifyEmail() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState("");

  const navigate = useNavigate();

  // Fetch current user details to show email address on page
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await api.get("/me");
        setUserEmail(res.data.email);
        if (res.data.is_verified) {
          sessionStorage.setItem("is_verified", "true");
          navigate("/dashboard");
        }
      } catch (err) {
        console.error("Failed to fetch user:", err);
      }
    };
    fetchUser();
  }, [navigate]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => {
      setCooldown(cooldown - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError("Please enter a 6-digit verification code");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      await api.post("/verify-email", { code });
      sessionStorage.setItem("is_verified", "true");
      setMessage("Email verified successfully! Redirecting...");
      setTimeout(() => {
        navigate("/dashboard");
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid or expired code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;

    setResending(true);
    setError("");
    setMessage("");

    try {
      await api.post("/resend-verification");
      setMessage("Verification code resent successfully!");
      setCooldown(30); // 30 seconds cooldown as specified in Plan v2
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to resend code.");
    } finally {
      setResending(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    sessionStorage.clear();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-[var(--bg-canvas-gradient)] text-[var(--text-primary)] flex justify-center items-center p-4 md:p-8 font-sans">
      <div className="w-full max-w-[440px] auvon-card shadow-2xl bg-[var(--bg-surface)] flex flex-col gap-6 animate-fade-in">
        <div>
          <span className="text-xl font-bold tracking-tight font-heading">
            Auvon <span className="text-[var(--accent-primary)] font-semibold">ai</span>
          </span>
          <h1 className="text-2xl font-bold tracking-tight font-heading mt-4">Check your email</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            We sent a 6-digit verification code to{" "}
            <span className="font-semibold text-[var(--text-primary)] break-all">{userEmail || "your email address"}</span>. Check spam too.
          </p>
        </div>

        <form onSubmit={handleVerify} className="flex flex-col gap-4">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/[^0-9]/g, ""));
              if (error) setError("");
            }}
            className={`w-full text-center tracking-[0.5em] text-3xl font-bold bg-[var(--bg-surface-subtle)] border ${
              error ? "border-red-400" : "border-[var(--border-subtle)]"
            } text-[var(--text-primary)] placeholder:text-[var(--text-muted)] p-4 rounded-xl focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-colors`}
            required
            disabled={loading}
            autoFocus
          />

          {error && <p className="text-xs text-red-500 font-mono text-center">{error}</p>}
          {message && <p className="text-xs text-[var(--accent-primary)] font-mono text-center">{message}</p>}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="auvon-pill-btn-primary w-full py-3.5 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                <span>Verifying…</span>
              </>
            ) : (
              <span>Verify account →</span>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-col items-center gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-secondary)]">Didn't get a code?</span>
            {cooldown > 0 ? (
              <span className="text-[var(--text-muted)]">Resend in {cooldown}s</span>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="text-[var(--accent-primary)] font-semibold hover:underline focus:outline-none cursor-pointer"
              >
                {resending ? "Resending…" : "Resend code"}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline focus:outline-none cursor-pointer"
          >
            Sign in with a different account
          </button>
        </div>
      </div>
    </div>
  );
}

export default VerifyEmail;
