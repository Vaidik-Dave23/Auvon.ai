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
      <div className="min-h-screen bg-base p-6 flex gap-6">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base p-6 flex gap-6">
      <Sidebar />

      <div className="flex-1 animate-fade-in flex flex-col items-center">
        <header className="w-full max-w-3xl mb-10 pt-4">
          <h1 className="text-4xl font-bold text-textMain tracking-tight mb-2">Profile & Settings</h1>
          <p className="text-textMuted">Manage your account and app preferences.</p>
        </header>

        <div className="w-full max-w-3xl flex flex-col gap-8">
          
          {/* PROFILE SECTION */}
          <div className="glass-panel p-8 rounded-3xl relative overflow-hidden border-white/5">
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl pointer-events-none -z-10" />
            
            <div className="flex justify-between items-start mb-8">
              <h2 className="text-2xl font-bold text-textMain flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-accent" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                Personal Details
              </h2>
              {!isEditing ? (
                <button 
                  onClick={() => setIsEditing(true)}
                  className="glass-button px-4 py-2 rounded-lg text-textMain text-sm font-medium hover:text-accent flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                  Edit Profile
                </button>
              ) : (
                <div className="flex gap-2">
                  <button 
                    onClick={handleCancel}
                    className="glass-button px-4 py-2 rounded-lg text-textMuted hover:text-textMain text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accentHover transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-textMuted uppercase tracking-wider">Full Name</label>
                {isEditing ? (
                  <input 
                    type="text" 
                    value={editForm.name} 
                    onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                    className="w-full bg-cardHover p-3 rounded-xl border border-white/10 focus:border-accent/50 outline-none text-textMain"
                  />
                ) : (
                  <p className="text-xl font-medium text-textMain">{user.name}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-textMuted uppercase tracking-wider">Email Address</label>
                {isEditing ? (
                  <input 
                    type="email" 
                    value={editForm.email} 
                    onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                    className="w-full bg-cardHover p-3 rounded-xl border border-white/10 focus:border-accent/50 outline-none text-textMain"
                  />
                ) : (
                  <p className="text-xl font-medium text-textMain">{user.email}</p>
                )}
              </div>

              {!isEditing && (
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-textMuted uppercase tracking-wider">Member Since</label>
                  <p className="text-lg font-medium text-textMain opacity-80">{formatJoinDate(user.created_at)}</p>
                </div>
              )}
            </div>
          </div>

          {/* SETTINGS SECTION */}
          <div className="glass-panel p-8 rounded-3xl border-white/5">
            <h2 className="text-2xl font-bold text-textMain mb-6 flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
              Appearance
            </h2>

            <div className="flex flex-col gap-4">
              <label className="text-sm font-semibold text-textMuted uppercase tracking-wider mb-2">Theme Mode</label>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Theme Options */}
                {[
                  { id: 'dark', name: 'Premium Dark', color: '#0f172a' },
                  { id: 'ocean', name: 'Deep Ocean', color: '#080e2c' },
                  { id: 'light', name: 'Clean Light', color: '#f8fafc', border: true }
                ].map((t) => (
                  <div 
                    key={t.id}
                    onClick={() => toggleTheme(t.id)}
                    className={`cursor-pointer rounded-2xl p-4 flex flex-col items-center gap-3 transition-all duration-300 border-2 ${
                      theme === t.id 
                        ? "border-accent bg-accent/5 shadow-[0_0_15px_rgba(139,92,246,0.2)] scale-105" 
                        : "border-white/5 hover:border-white/20 bg-cardHover/50"
                    }`}
                  >
                    <div 
                      className={`w-12 h-12 rounded-full shadow-inner ${t.border ? 'border border-black/10' : 'border border-white/10'}`} 
                      style={{ backgroundColor: t.color }} 
                    />
                    <span className={`font-medium ${theme === t.id ? "text-textMain" : "text-textMuted"}`}>
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
