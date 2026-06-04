import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "../api/axios";

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    const isVerifiedCached = sessionStorage.getItem("is_verified") === "true";
    if (isVerifiedCached) {
      setVerified(true);
      setLoading(false);
      return;
    }

    const checkVerification = async () => {
      try {
        const res = await api.get("/me");
        if (res.data.is_verified) {
          sessionStorage.setItem("is_verified", "true");
          setVerified(true);
        } else {
          sessionStorage.setItem("is_verified", "false");
          setVerified(false);
        }
      } catch (err) {
        console.error("Verification check failed:", err);
        localStorage.removeItem("token");
        sessionStorage.clear();
      } finally {
        setLoading(false);
      }
    };

    checkVerification();
  }, [token]);

  if (!token) {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
      </div>
    );
  }

  const isVerifyPage = location.pathname === "/verify-email";

  if (!verified && !isVerifyPage) {
    return <Navigate to="/verify-email" replace />;
  }

  if (verified && isVerifyPage) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default ProtectedRoute;