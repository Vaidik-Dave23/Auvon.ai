import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { saveSession } from "../api/axios";
import { authQuote } from "../content/authQuote";
import GoogleAuthButton from "../components/GoogleAuthButton";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);

  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setEmailError(false);
    setPasswordError(false);

    try {
      const res = await api.post("/login", {
        email,
        password,
      });

      // token save
      saveSession(res.data);
      sessionStorage.setItem("is_verified", res.data.is_verified ? "true" : "false");

      if (res.data.is_verified) {
        navigate("/dashboard");
      } else {
        navigate("/verify-email");
      }
    } catch (err) {
      const msg = err.response?.data?.detail || "That email and password don't match.";
      setError(msg);
      setEmailError(true);
      setPasswordError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-canvas-gradient)] text-[var(--text-primary)] relative flex flex-col justify-center items-center p-4 md:p-8 transition-colors duration-250 font-sans">
      <div className="w-full max-w-[1020px] grid grid-cols-1 md:grid-cols-12 auvon-card !p-0 overflow-hidden shadow-2xl">
        {/* LEFT: Form Side */}
        <div className="md:col-span-7 p-8 md:p-14 flex flex-col justify-center bg-[var(--bg-surface)]">
          <div className="max-w-[380px] w-full mx-auto flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl font-bold tracking-tight text-[var(--text-primary)] font-heading">
                  Auvon <span className="text-[var(--accent-primary)] font-semibold">ai</span>
                </span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] font-heading">
                Sign in to Auvon ai
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Enter your credentials to resume your learning roadmap.
              </p>
            </div>

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="name@university.edu"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError(false);
                  }}
                  className={`w-full bg-[var(--bg-surface-subtle)] border ${
                    emailError ? "border-red-400" : "border-[var(--border-subtle)]"
                  } text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-4 py-3 rounded-xl focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-all font-sans text-sm`}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => navigate("/forgot-password")}
                    className="text-xs text-[var(--accent-primary)] font-semibold hover:underline focus:outline-none cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError(false);
                  }}
                  className={`w-full bg-[var(--bg-surface-subtle)] border ${
                    passwordError ? "border-red-400" : "border-[var(--border-subtle)]"
                  } text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-4 py-3 rounded-xl focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-all font-sans text-sm`}
                  required
                />
              </div>

              {error && (
                <p className="text-xs text-red-500 font-mono mt-1">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="auvon-pill-btn-primary w-full py-3.5 text-sm font-semibold flex items-center justify-center gap-2 mt-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <span>Continue to Workspace →</span>
                )}
              </button>
            </form>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[var(--border-subtle)]" />
              <span className="text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                or continue with
              </span>
              <div className="flex-1 h-px bg-[var(--border-subtle)]" />
            </div>

            <GoogleAuthButton
              mode="signin"
              onError={(msg) => setError(msg)}
              loading={loading}
            />

            <div className="text-xs text-[var(--text-secondary)] text-center mt-2">
              No account yet?{" "}
              <button
                type="button"
                onClick={() => navigate("/register")}
                className="text-[var(--accent-primary)] font-semibold hover:underline focus:outline-none cursor-pointer"
              >
                Create an account
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Editorial Sanctuary Side */}
        <div className="hidden md:flex md:col-span-5 flex-col justify-center p-12 bg-[var(--bg-surface-subtle)] border-l border-[var(--border-subtle)]">
          <div className="flex flex-col gap-6">
            <blockquote className="font-serif italic text-2xl lg:text-3xl text-[var(--text-primary)] leading-relaxed">
              "{authQuote.text}"
            </blockquote>
            <div className="w-12 h-0.5 bg-[var(--accent-primary)]" />
            <p className="text-xs font-mono text-[var(--text-secondary)] tracking-wide">
              {authQuote.attribution}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;