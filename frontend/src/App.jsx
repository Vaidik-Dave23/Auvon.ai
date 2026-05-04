import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";

import ProtectedRoute from "./components/ProtectedRoute";

import LandingPage from "./pages/LandingPage";
import About from "./pages/About";
import Profile from "./pages/Profile";

import Dashboard from "./pages/Dashboard";
import Goal from "./pages/Goal";
import Notes from "./pages/Notes";
import NoteReader from "./pages/NoteReader";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Tests from "./pages/Tests";
import TestAttempt from "./pages/TestAttempt";
import TestResult from "./pages/TestResult";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>

          {/* PUBLIC */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/about" element={<About />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* PROTECTED */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/goals" element={<ProtectedRoute><Goal /></ProtectedRoute>} />
          <Route path="/notes" element={<ProtectedRoute><Notes /></ProtectedRoute>} />
          <Route path="/note/:id" element={<ProtectedRoute><NoteReader /></ProtectedRoute>} />
          <Route path="/tests" element={<ProtectedRoute><Tests /></ProtectedRoute>} />
          <Route path="/test/:id" element={<ProtectedRoute><TestAttempt /></ProtectedRoute>} />
          <Route path="/result/:id" element={<ProtectedRoute><TestResult /></ProtectedRoute>} />

        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;