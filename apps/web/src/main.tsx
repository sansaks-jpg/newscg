import { StrictMode } from "react"; import { createRoot } from "react-dom/client"; import App from "./App"; import "./styles.css"; import "./newsroom.css"; import "./broadcast-cnn.css"; import "./live-control.css";
createRoot(document.getElementById("root")!).render(<StrictMode><App/></StrictMode>);
