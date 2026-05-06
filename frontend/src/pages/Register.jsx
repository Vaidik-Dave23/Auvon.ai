import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await api.post("/register", {
        name,
        email,
        password,
      });

      // Auto-login with the token received from registration
      if (res.data.access_token) {
        localStorage.setItem("token", res.data.access_token);
        navigate("/dashboard");
      }
    } catch (err) {
      const detail = err.response?.data?.detail;
      const message = typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((item) => item?.msg || JSON.stringify(item)).join(" \n")
          : JSON.stringify(detail);
      alert(message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-base relative overflow-hidden">
      {/* Ambient Background Glows */}
      <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-accent/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] bg-success/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="glass-panel border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-3xl p-10 w-full max-w-md text-textMain animate-fade-in relative z-10 mx-4">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-accent to-accentHover mb-3 tracking-tight">
            Start Your Learning Journey
          </h1>
          <p className="text-textMuted font-medium">Join thousands of students using AI-powered learning tools.</p>
        </div>

        <form onSubmit={handleRegister} className="flex flex-col gap-5">
          <div className="space-y-4">
            <div className="relative group">
              <input
                type="text"
                placeholder="Full Name"
                className="w-full bg-cardHover/50 border border-white/10 text-textMain placeholder:text-textMuted/50 p-4 rounded-xl focus:outline-none focus:border-accent/50 focus:bg-white/5 transition-all"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="relative group">
              <input
                type="email"
                placeholder="Email address"
                className="w-full bg-cardHover/50 border border-white/10 text-textMain placeholder:text-textMuted/50 p-4 rounded-xl focus:outline-none focus:border-accent/50 focus:bg-white/5 transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="relative group">
              <input
                type="password"
                placeholder="Create Password"
                className="w-full bg-cardHover/50 border border-white/10 text-textMain placeholder:text-textMuted/50 p-4 rounded-xl focus:outline-none focus:border-accent/50 focus:bg-white/5 transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-4 mt-4 rounded-xl font-bold text-lg text-white transition-all duration-300 flex items-center justify-center gap-2 ${
                loading 
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
                    Creating Account...
                </>
            ) : "Create Account"}
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-white/5 flex flex-col items-center gap-3">
          <p className="text-textMuted text-sm">Already have an account?</p>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="text-accent font-semibold hover:text-accentHover transition-colors hover:underline"
          >
            Sign in instead
          </button>
        </div>
      </div>
    </div>
  );
}

export default Register;