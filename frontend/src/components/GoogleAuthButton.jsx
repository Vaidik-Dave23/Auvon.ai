import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

/**
 * GoogleAuthButton renders the official Google Identity Services sign-in / sign-up button
 * with automatic fallback to styled UI if the client ID or script is loading.
 *
 * @param {Object} props
 * @param {"signin"|"signup"} [props.mode="signin"]
 * @param {Function} [props.onSuccess]
 * @param {Function} [props.onError]
 * @param {boolean} [props.loading]
 */
export default function GoogleAuthButton({
  mode = "signin",
  onSuccess,
  onError,
  loading: parentLoading = false,
}) {
  const containerRef = useRef(null);
  const navigate = useNavigate();
  const [internalLoading, setInternalLoading] = useState(false);
  const [gsiRendered, setGsiRendered] = useState(false);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const handleCredentialResponse = async (response) => {
    if (!response?.credential) {
      if (onError) onError("No credential returned from Google.");
      return;
    }

    setInternalLoading(true);
    try {
      const res = await api.post("/auth/google", {
        credential: response.credential,
      });

      // Save tokens using existing auth architecture
      localStorage.setItem("token", res.data.access_token);
      sessionStorage.setItem(
        "is_verified",
        res.data.is_verified ? "true" : "false"
      );
      api.defaults.headers.common["Authorization"] = `Bearer ${res.data.access_token}`;

      if (onSuccess) {
        onSuccess(res.data);
      } else {
        navigate("/dashboard");
      }
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        "Google authentication failed. Please try again.";
      if (onError) onError(msg);
    } finally {
      setInternalLoading(false);
    }
  };

  useEffect(() => {
    if (!clientId) {
      return;
    }

    let isMounted = true;

    const setupGsi = () => {
      if (!window.google?.accounts?.id || !containerRef.current) {
        return false;
      }

      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        // Clear existing children to prevent duplicate buttons on re-render
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
          window.google.accounts.id.renderButton(containerRef.current, {
            type: "standard",
            theme: "outline",
            size: "large",
            shape: "rectangular",
            text: mode === "signup" ? "signup_with" : "signin_with",
            width: "100%",
            logo_alignment: "left",
          });
          if (isMounted) setGsiRendered(true);
        }
        return true;
      } catch (err) {
        console.warn("Google Identity Services initialization warning:", err);
        return false;
      }
    };

    if (!setupGsi()) {
      // If script is still loading, poll briefly until available
      const interval = setInterval(() => {
        if (setupGsi()) {
          clearInterval(interval);
        }
      }, 200);

      const timeout = setTimeout(() => clearInterval(interval), 4000);
      return () => {
        isMounted = false;
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }

    return () => {
      isMounted = false;
    };
  }, [clientId, mode]);

  const handleManualClick = () => {
    if (!clientId) {
      if (onError) {
        onError(
          "Google Client ID is not configured yet. Set VITE_GOOGLE_CLIENT_ID in your frontend/.env file."
        );
      }
      return;
    }

    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    }
  };

  const isLoading = parentLoading || internalLoading;

  return (
    <div className="w-full flex flex-col items-center">
      {/* Official GSI rendered target container */}
      <div
        ref={containerRef}
        className={`w-full flex justify-center ${
          gsiRendered && clientId ? "block" : "hidden"
        }`}
      />

      {/* Styled fallback button displayed when GSI button is loading or clientId is pending */}
      {(!gsiRendered || !clientId) && (
        <button
          type="button"
          onClick={handleManualClick}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg border border-border bg-input hover:bg-surface text-text-primary text-sm font-medium transition-all shadow-sm focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 disabled:cursor-not-allowed"
          title={
            !clientId
              ? "Set VITE_GOOGLE_CLIENT_ID in frontend/.env to enable"
              : undefined
          }
        >
          {isLoading ? (
            <svg
              className="animate-spin h-5 w-5 text-accent"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5 flex-shrink-0"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                fill="#EA4335"
              />
            </svg>
          )}
          <span>
            {mode === "signup" ? "Sign up with Google" : "Sign in with Google"}
          </span>
        </button>
      )}
    </div>
  );
}
