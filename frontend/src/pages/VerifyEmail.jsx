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
      setError(err.response?.data?.detail || "Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;

    setResending(true);
    setError("");
    setMessage("");

    try {
      await api.post("/resend-verification");
      setMessage("Verification code resent successfully!");
      setCooldown(60); // 60 seconds cooldown
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
    <div className="flex items-center justify-center min-h-screen bg-base relative overflow-hidden text-textMain px-4">
      {/* Ambient Background Glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-accent/20 rounded-full blur-[120px] pointer-events-none animate-pulse-glow" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse-glow" style={{ animationDelay: '1s' }} />

      <div className="glass-panel border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-3xl p-10 w-full max-w-md animate-fade-in relative z-10 mx-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-accent to-accentHover mb-3 tracking-tight">
            Verify Your Email
          </h1>
          <p className="text-textMuted font-medium mb-1">We sent a 6-digit verification code to:</p>
          <p className="text-accent font-semibold break-all">{userEmail || "your email address"}</p>
        </div>

        <form onSubmit={handleVerify} className="flex flex-col gap-6">
          <div className="space-y-4">
            <div className="relative flex flex-col items-center">
              <input
                type="text"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, "");
                  setCode(val);
                }}
                className="w-full text-center tracking-[0.5em] text-3xl font-bold bg-cardHover/50 border border-white/10 text-textMain placeholder:text-textMuted/30 p-4 rounded-xl focus:outline-none focus:border-accent/50 focus:bg-white/5 transition-all"
                required
                disabled={loading}
              />
              <p className="text-xs text-textMuted mt-2">Enter the 6-digit OTP code.</p>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-error/10 border border-error/20 text-error rounded-xl text-sm font-medium text-center animate-shake">
              {error}
            </div>
          )}

          {message && (
            <div className="p-3 bg-success/10 border border-success/20 text-success rounded-xl text-sm font-medium text-center">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className={`w-full py-4 rounded-xl font-bold text-lg text-white transition-all duration-300 flex items-center justify-center gap-2 ${
              loading || code.length !== 6
                ? "bg-cardHover text-textMuted cursor-not-allowed border border-white/5"
                : "bg-gradient-to-r from-accent to-accentHover hover:scale-[1.02] active:scale-95 shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)]"
            }`}
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Verifying...
              </>
            ) : "Verify Account"}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/5 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-textMuted text-sm">Didn't receive the code?</span>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending || cooldown > 0}
              className={`font-semibold text-sm transition-colors ${
                cooldown > 0 || resending
                  ? "text-textMuted cursor-not-allowed"
                  : "text-accent hover:text-accentHover hover:underline"
              }`}
            >
              {resending ? "Resending..." : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Code"}
            </button>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="text-textMuted text-sm hover:text-white transition-colors flex items-center gap-2 hover:underline"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign in with a different account
          </button>
        </div>
      </div>
    </div>
  );
}

export default VerifyEmail;
