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
    <div className="min-h-screen bg-page flex items-center justify-center p-6 text-text-primary">
      <div className="bg-surface border border-border w-full max-w-[420px] p-8 rounded-xl flex flex-col gap-6 shadow-lg animate-fade-in">
        <div className="text-center">
          <h1 className="font-serif text-2xl font-semibold mb-2">
            Check your email
          </h1>
          <p className="text-text-secondary text-sm">
            We sent a 6-digit verification code to
          </p>
          <p className="text-text-primary font-medium text-sm break-all mt-1">
            {userEmail || "your email address"}
          </p>
        </div>

        <form onSubmit={handleVerify} className="flex flex-col gap-5">
          <div className="flex flex-col items-center">
            <input
              type="text"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, "");
                setCode(val);
                if (error) setError("");
              }}
              className={`w-full text-center tracking-[0.5em] text-3xl font-bold bg-input border ${
                error ? "border-danger" : "border-border"
              } text-text-primary placeholder:text-text-tertiary/30 p-4 rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all`}
              required
              disabled={loading}
              autoFocus
            />
            <p className="text-xs text-text-tertiary mt-2">
              Enter the 6-digit OTP code.
            </p>
          </div>

          {error && (
            <div className="text-sm text-danger font-medium text-center animate-fade-in">
              {error}
            </div>
          )}

          {message && (
            <div className="text-sm text-success font-medium text-center animate-fade-in">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className={`w-full bg-control hover:bg-black/40 text-text-primary border border-border py-3 rounded-lg font-sans font-semibold transition-all flex items-center justify-center gap-2 ${
              loading || code.length !== 6 ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Verifying...
              </>
            ) : (
              "Verify Account"
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-border flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-tertiary">Didn't get a code?</span>
            {cooldown > 0 ? (
              <span className="text-text-tertiary font-medium">
                Resend in {cooldown}s
              </span>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="text-accent font-semibold hover:underline transition-colors focus:outline-none"
              >
                {resending ? "Resending..." : "Resend Code"}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="text-text-tertiary text-xs hover:text-text-primary transition-colors flex items-center gap-1 hover:underline focus:outline-none"
          >
            Sign in with a different account
          </button>
        </div>
      </div>
    </div>
  );
}

export default VerifyEmail;
