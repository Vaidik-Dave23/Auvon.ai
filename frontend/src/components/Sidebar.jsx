import FloatingNav from "./FloatingNav";

/**
 * Sidebar adapter: renders the centered floating top navigation dock
 * across all existing views while maintaining backwards compatibility.
 */
export default function Sidebar(props) {
  return <FloatingNav {...props} />;
}