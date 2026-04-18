import { RouterProvider } from "react-router-dom";
import { router } from "./routes";
import "../styles/global.css";
import "../styles/auth.css";
import "../styles/dashboard.css";

export default function App() {
  return <RouterProvider router={router} />;
}