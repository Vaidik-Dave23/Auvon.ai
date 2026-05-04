import api from "./axios";

// 🔍 search
export const searchNotes = (query) => {
  return api.get(`/notes/search?q=${query}`);
};

// 🤖 generate
export const generateNotes = (query) => {
  return api.post(`/notes/generate?query=${query}`);
};

// 👤 my notes
export const getMyNotes = () => {
  return api.get(`/notes/my`);
};

// 📄 pdf upload
export const uploadPDF = (file) => {
  const formData = new FormData();
  formData.append("file", file);

  return api.post("/notes/pdf", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
};