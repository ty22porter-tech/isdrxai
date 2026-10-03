import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installMarketingClickTracking } from "./lib/analytics";

const stopClickTracking = installMarketingClickTracking();
if (import.meta.hot) import.meta.hot.dispose(stopClickTracking);

createRoot(document.getElementById("root")!).render(<App />);
