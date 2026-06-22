import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { authQuote } from "../content/authQuote";

function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Field validation states
  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [generalError, setGeneralError] = useState("");

  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setNameError("");
    setEmailError("");
    setPasswordError("");
    setGeneralError("");

    // Client-side validations
    let hasError = false;
    if (!name.trim()) {
      setNameError("Name is required");
      hasError = true;
    }
    if (!email.trim() || !email.includes("@")) {
      setEmailError("Enter a valid email address");
      hasError = true;
    }
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters long");
      hasError = true;
    }

    if (hasError) {
      setLoading(false);
      return;
    }

    try {
      const res = await api.post("/register", {
        name,
        email,
        password,
      });

      // Auto-login with the token received from registration
      if (res.data.access_token) {
        localStorage.setItem("token", res.data.access_token);
        sessionStorage.setItem("is_verified", "false");
        navigate("/verify-email");
      }
    } catch (err) {
      const detail = err.response?.data?.detail;
      const message = typeof detail === "string" ? detail : "";

      if (message.toLowerCase().includes("email") || message.toLowerCase().includes("already registered")) {
        setEmailError(message || "Email is already registered");
      } else if (message.toLowerCase().includes("password")) {
        setPasswordError(message || "Invalid password format");
      } else if (message.toLowerCase().includes("name")) {
        setNameError(message || "Invalid name format");
      } else {
        setGeneralError(message || "Registration failed. Please try again.");
      }
      
      if (detail === "Email already registered and verified") {
        navigate("/login");
      }
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
              Get started
            </p>
            <h2 className="font-serif text-3xl font-medium text-text-primary">
              Create your account
            </h2>
          </div>

          <form onSubmit={handleRegister} className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              {/* Full Name */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-text-secondary">
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="Vaidik Dave"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (nameError) setNameError("");
                  }}
                  className={`w-full bg-input border ${
                    nameError ? "border-danger" : "border-border"
                  } text-text-primary placeholder:text-text-tertiary/60 px-4 py-3 rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all font-sans`}
                  required
                />
                {nameError && (
                  <p className="text-xs text-danger font-medium animate-fade-in">
                    {nameError}
                  </p>
                )}
              </div>

              {/* Email Address */}
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
                    if (emailError) setEmailError("");
                  }}
                  className={`w-full bg-input border ${
                    emailError ? "border-danger" : "border-border"
                  } text-text-primary placeholder:text-text-tertiary/60 px-4 py-3 rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all font-sans`}
                  required
                />
                {emailError && (
                  <p className="text-xs text-danger font-medium animate-fade-in">
                    {emailError}
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-text-secondary">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="Minimum 8 characters"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError("");
                  }}
                  className={`w-full bg-input border ${
                    passwordError ? "border-danger" : "border-border"
                  } text-text-primary placeholder:text-text-tertiary/60 px-4 py-3 rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all font-sans`}
                  required
                />
                {passwordError && (
                  <p className="text-xs text-danger font-medium animate-fade-in">
                    {passwordError}
                  </p>
                )}
              </div>
            </div>

            {generalError && (
              <p className="text-sm text-danger font-medium animate-fade-in">
                {generalError}
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
                  Creating account...
                </>
              ) : (
                "Create account"
              )}
            </button>
          </form>

          <div className="text-sm text-text-secondary mt-2">
            Already have an account?{" "}
            <button
              onClick={() => navigate("/login")}
              className="text-accent font-medium hover:underline focus:outline-none"
            >
              Sign in
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

export default Register;