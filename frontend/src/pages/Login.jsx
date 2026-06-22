import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { authQuote } from "../content/authQuote";

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
      localStorage.setItem("token", res.data.access_token);
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
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2 bg-page">
      {/* LEFT: Form Side */}
      <div className="flex items-center justify-center bg-surface p-8 md:p-16">
        <div className="w-full max-w-[380px] flex flex-col gap-8">
          <div>
            <h1 className="font-serif text-3xl font-semibold text-text-primary mb-12">
              Auvon
            </h1>
            <p className="text-xs font-semibold tracking-wider text-text-tertiary uppercase mb-2">
              Welcome back
            </p>
            <h2 className="font-serif text-3xl font-medium text-text-primary">
              Sign in to continue
            </h2>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-text-secondary">
                  Email address
                </label>
                <input
                  type="email"
                  placeholder="you@school.edu"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError(false);
                  }}
                  className={`w-full bg-input border ${
                    emailError ? "border-danger" : "border-border"
                  } text-text-primary placeholder:text-text-tertiary/60 px-4 py-3 rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all font-sans`}
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-text-secondary">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError(false);
                  }}
                  className={`w-full bg-input border ${
                    passwordError ? "border-danger" : "border-border"
                  } text-text-primary placeholder:text-text-tertiary/60 px-4 py-3 rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all font-sans`}
                  required
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-danger font-medium animate-fade-in">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full bg-accent text-accent-text py-3 rounded-lg font-sans font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2 ${
                loading ? "opacity-70 cursor-not-allowed" : ""
              }`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-accent-text" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <div className="text-sm text-text-secondary mt-2">
            No account yet?{" "}
            <button
              onClick={() => navigate("/register")}
              className="text-accent font-medium hover:underline focus:outline-none"
            >
              Create one
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT: Editorial Side */}
      <div className="hidden md:flex flex-col justify-center items-center bg-page p-16 border-l border-border-subtle">
        <div className="max-w-[460px] flex flex-col gap-6 text-left">
          <blockquote className="font-serif text-3xl md:text-4xl text-text-primary leading-normal italic">
            "{authQuote.text}"
          </blockquote>
          <hr className="border-border-subtle w-16" />
          <p className="text-text-tertiary text-sm font-sans tracking-wide">
            {authQuote.attribution}
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;