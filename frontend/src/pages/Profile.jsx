import { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import { useTheme } from "../context/ThemeContext";
import api from "../api/axios";

function Profile() {
  const { theme, setTheme } = useTheme();

  const [user, setUser] = useState({
    name: "",
    email: "",
    created_at: null,
  });
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", email: "" });
  const [saving, setSaving] = useState(false);

  // Fetch user profile data
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await api.get("/me");
        setUser(response.data);
        setEditForm({ name: response.data.name, email: response.data.email });
      } catch (error) {
        console.error("Failed to fetch profile:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await api.put("/me", editForm);
      setUser(response.data);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update profile:", error);
      alert(error.response?.data?.detail || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditForm({ name: user.name, email: user.email });
    setIsEditing(false);
  };

  const formatJoinDate = (dateString) => {
    if (!dateString) return "Unknown";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] flex text-[var(--text-primary)] font-sans">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-[var(--accent-primary)]/20 border-t-[var(--accent-primary)] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col font-sans transition-colors duration-250">
      <Sidebar />

      {/* Main Centered Container */}
      <main className="w-full max-w-[1100px] mx-auto px-6 pb-20 flex flex-col gap-8 flex-1 animate-fade-in">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-[var(--text-primary)] font-heading">
            Profile & Settings
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Manage your personal learning profile and active design system.
          </p>
        </header>

        <div className="flex flex-col gap-8">
          {/* PROFILE SECTION */}
          <div className="auvon-card flex flex-col gap-6">
            <div className="flex justify-between items-center pb-4 border-b border-[var(--border-subtle)]">
              <div>
                <h2 className="text-lg font-bold font-heading text-[var(--text-primary)]">
                  Personal Details
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Update your identity details and account contact.
                </p>
              </div>

              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="auvon-pill-btn-secondary text-xs py-2 px-4 cursor-pointer"
                >
                  Edit Profile
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleCancel}
                    className="auvon-pill-btn-secondary text-xs py-2 px-3.5 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="auvon-pill-btn-primary text-xs py-2 px-4 cursor-pointer disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-mono font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  Full Name
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] px-4 py-2.5 rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-all font-sans"
                  />
                ) : (
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{user.name}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-mono font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  Email Address
                </label>
                {isEditing ? (
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] px-4 py-2.5 rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-all font-sans"
                  />
                ) : (
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{user.email}</p>
                )}
              </div>

              {!isEditing && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-mono font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Member Since
                  </label>
                  <p className="text-sm font-mono text-[var(--text-secondary)]">
                    {formatJoinDate(user.created_at)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* APPEARANCE / DUAL-THEME ARCHITECTURE */}
          <div className="auvon-card flex flex-col gap-6">
            <div className="pb-4 border-b border-[var(--border-subtle)]">
              <h2 className="text-lg font-bold font-heading text-[var(--text-primary)]">
                Dual-Theme Architecture
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Select between Soho Sanctuary and Alpine Glasshouse daylight design systems.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Soho Sanctuary Option */}
              <div
                onClick={() => setTheme("soho")}
                className={`cursor-pointer rounded-2xl p-5 flex flex-col gap-4 border-2 transition-all select-none ${
                  theme === "soho"
                    ? "border-[#0052FF] bg-[#EBF1FF]/40 shadow-sm"
                    : "border-[var(--border-subtle)] hover:border-[var(--border-card)] bg-[var(--bg-surface-subtle)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#0052FF] flex items-center justify-center text-white font-bold text-xs shadow-sm">
                      a
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#0F172A] font-heading">
                        Soho Sanctuary
                      </h3>
                      <p className="text-[11px] text-[#475569]">
                        Default • Sunlit Alabaster
                      </p>
                    </div>
                  </div>
                  {theme === "soho" && (
                    <span className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-full bg-[#0052FF] text-white">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#475569] leading-relaxed">
                  Sunlit gallery porcelain inspired by Craft.do, Amie, and Things 3. Pure white high-radius cards with electric Cobalt focus.
                </p>
              </div>

              {/* Alpine Glasshouse Option */}
              <div
                onClick={() => setTheme("alpine")}
                className={`cursor-pointer rounded-2xl p-5 flex flex-col gap-4 border-2 transition-all select-none ${
                  theme === "alpine"
                    ? "border-[#2E7D52] bg-[#E3EFE8]/50 shadow-sm"
                    : "border-[var(--border-subtle)] hover:border-[var(--border-card)] bg-[var(--bg-surface-subtle)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[#2E7D52] flex items-center justify-center text-white font-bold text-xs shadow-sm">
                      ✦
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#0F211C] font-heading">
                        Alpine Glasshouse
                      </h3>
                      <p className="text-[11px] text-[#3D524B]">
                        Biophilic Swiss Glasshouse
                      </p>
                    </div>
                  </div>
                  {theme === "alpine" && (
                    <span className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-full bg-[#2E7D52] text-white">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#3D524B] leading-relaxed">
                  Biophilic Swiss retreat inspired by Therme Vals & Vitra Campus. Translucent frosted quartz with Deep Spruce & Meadow Chartreuse.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Profile;
