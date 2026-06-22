import { useNavigate, useLocation } from "react-router-dom";

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const menu = [
    { name: "Dashboard", path: "/dashboard" },
    { name: "Goals", path: "/goals" },
    { name: "Notes", path: "/notes" },
    { name: "Tests", path: "/tests" },
    { name: "Profile", path: "/profile" },
  ];

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/");
  };

  return (
    <div className="w-64 h-screen bg-sidebar border-r border-border-subtle flex flex-col p-6 sticky top-0 flex-shrink-0 select-none">
      <div className="flex items-center gap-3 mb-10 px-2">
        <h1 className="font-serif text-3xl font-semibold text-text-primary">
          Auvon
        </h1>
      </div>

      <div className="flex flex-col gap-1.5">
        {menu.map((item) => {
          const active = location.pathname === item.path;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`text-left px-4 py-3 rounded-r-md transition-all duration-300 font-sans font-medium flex items-center gap-3 border-l-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-offset-1
                ${
                  active
                    ? "bg-surface text-text-primary border-accent"
                    : "border-transparent text-text-tertiary hover:text-text-primary hover:bg-surface/30"
                }`}
            >
              {item.name}
            </button>
          );
        })}
      </div>

      <button
        onClick={handleLogout}
        className="mt-auto text-left px-4 py-3 font-sans font-medium text-text-tertiary hover:text-danger transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-offset-1"
      >
        Sign out
      </button>
    </div>
  );
}

export default Sidebar;