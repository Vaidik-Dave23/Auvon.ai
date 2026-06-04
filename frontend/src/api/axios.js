import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response &&
      error.response.status === 403 &&
      error.response.data?.detail === "Email not verified"
    ) {
      sessionStorage.setItem("is_verified", "false");
      if (!window.location.pathname.startsWith("/verify-email")) {
        window.location.href = "/verify-email";
      }
    }
    return Promise.reject(error);
  }
);

export default api;