import { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import { useTheme } from "../context/ThemeContext";
import api from "../api/axios";

function Profile() {
  const { theme, toggleTheme } = useTheme();
  
  const [user, setUser] = useState({
    name: "",
    email: "",
    created_at: null
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
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-page flex text-text-primary font-sans">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page flex text-text-primary font-sans">
      <Sidebar />

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 h-screen overflow-y-auto p-8 flex flex-col gap-8 animate-fade-in">
        <header className="flex flex-col gap-1">
          <h1 className="font-serif text-3xl font-semibold text-text-primary">
            Profile & Settings
          </h1>
          <p className="text-text-secondary text-sm">
            Manage your account and app preferences.
          </p>
        </header>

        <div className="max-w-2xl w-full flex flex-col gap-8">
          
          {/* PROFILE SECTION */}
          <div className="bg-surface border border-border p-6 rounded-xl flex flex-col gap-6">
            <div className="flex justify-between items-center pb-4 border-b border-border-subtle">
              <h2 className="font-serif text-xl font-medium text-text-primary">
                Personal Details
              </h2>

              {!isEditing ? (
                <button 
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 border border-border text-text-secondary rounded-lg text-sm font-semibold hover:text-text-primary hover:bg-surface-alt transition-colors focus:outline-none"
                >
                  Edit Profile
                </button>
              ) : (
                <div className="flex gap-2">
                  <button 
                    onClick={handleCancel}
                    className="px-4 py-2 border border-border text-text-secondary rounded-lg text-sm font-semibold hover:text-text-primary hover:bg-surface-alt transition-colors focus:outline-none"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-control text-text-primary border border-border rounded-lg text-sm font-semibold hover:bg-black transition-colors focus:outline-none disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                  Full Name
                </label>
                {isEditing ? (
                  <input 
                    type="text" 
                    value={editForm.name} 
                    onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                    className="w-full bg-input border border-border p-3 rounded-lg text-text-primary focus:outline-none focus:border-accent text-sm font-sans"
                  />
                ) : (
                  <p className="text-sm font-medium text-text-primary">{user.name}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                  Email Address
                </label>
                {isEditing ? (
                  <input 
                    type="email" 
                    value={editForm.email} 
                    onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                    className="w-full bg-input border border-border p-3 rounded-lg text-text-primary focus:outline-none focus:border-accent text-sm font-sans"
                  />
                ) : (
                  <p className="text-sm font-medium text-text-primary">{user.email}</p>
                )}
              </div>

              {!isEditing && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    Member Since
                  </label>
                  <p className="text-sm font-medium text-text-secondary">{formatJoinDate(user.created_at)}</p>
                </div>
              )}
            </div>
          </div>

          {/* APPEARANCE / SETTINGS SECTION */}
          <div className="bg-surface border border-border p-6 rounded-xl flex flex-col gap-6">
            <h2 className="font-serif text-xl font-medium text-text-primary pb-4 border-b border-border-subtle">
              Appearance
            </h2>

            <div className="flex flex-col gap-4">
              <label className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                Theme Mode
              </label>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Theme Options */}
                {[
                  { id: 'dark', name: 'Premium Dark', color: '#181716' },
                  { id: 'ocean', name: 'Deep Ocean', color: '#080E24' },
                  { id: 'light', name: 'Clean Light', color: '#F8FAF4' }
                ].map((t) => (
                  <div 
                    key={t.id}
                    onClick={() => toggleTheme(t.id)}
                    className={`cursor-pointer rounded-lg p-4 flex flex-col items-center gap-3 transition-all duration-300 border-2 ${
                      theme === t.id 
                        ? "border-accent bg-surface-alt ring-1 ring-accent" 
                        : "border-border-subtle hover:border-text-tertiary bg-surface-alt"
                    }`}
                  >
                    <div 
                      className="w-10 h-10 rounded-full border border-border" 
                      style={{ backgroundColor: t.color }} 
                    />
                    <span className={`text-sm font-medium ${theme === t.id ? "text-text-primary" : "text-text-tertiary"}`}>
                      {t.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default Profile;
