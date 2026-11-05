import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// ---- session helpers (access token: 60 min, refresh token: 30 days) ----
export function saveSession(data) {
  if (data?.access_token) localStorage.setItem("token", data.access_token);
  if (data?.refresh_token) localStorage.setItem("refresh_token", data.refresh_token);
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("refresh_token");
  sessionStorage.clear();
}

// One refresh at a time: parallel 401s all wait for the same request.
let refreshPromise = null;
export function refreshSession() {
  if (!refreshPromise) {
    const refreshToken = localStorage.getItem("refresh_token");
    const accessToken = localStorage.getItem("token");
    refreshPromise = axios
      .post(
        `${import.meta.env.VITE_API_URL}/auth/refresh`,
        refreshToken ? { refresh_token: refreshToken } : {},
        // older sessions have no refresh token yet: upgrade with the (still valid) access token
        refreshToken || !accessToken ? {} : { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      .then((res) => {
        saveSession(res.data);
        return res.data.access_token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle user not found (e.g. database reset/migrated or deleted account)
    if (
      error.response &&
      error.response.status === 404 &&
      error.response.data?.detail === "User not found"
    ) {
      clearSession();
      if (
        !window.location.pathname.startsWith("/login") &&
        !window.location.pathname.startsWith("/register") &&
        window.location.pathname !== "/"
      ) {
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }

    // Handle email unverified
    if (
      error.response &&
      error.response.status === 403 &&
      error.response.data?.detail === "Email not verified"
    ) {
      sessionStorage.setItem("is_verified", "false");
      if (!window.location.pathname.startsWith("/verify-email")) {
        window.location.href = "/verify-email";
      }
      return Promise.reject(error);
    }

    // Handle token expiration/invalid token (401)
    if (
      error.response &&
      error.response.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/login") &&
      !originalRequest.url?.includes("/register") &&
      !originalRequest.url?.includes("/auth/google") &&
      !originalRequest.url?.includes("/refresh")
    ) {
      if (!localStorage.getItem("token") && !localStorage.getItem("refresh_token")) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;
      try {
        const newToken = await refreshSession();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshErr) {
        clearSession();
        if (
          !window.location.pathname.startsWith("/login") &&
          !window.location.pathname.startsWith("/register") &&
          window.location.pathname !== "/"
        ) {
          window.location.href = "/login";
        }
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
