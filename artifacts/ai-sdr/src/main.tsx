import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installMarketingClickTracking } from "./lib/analytics";
import { installVisitorActivity } from "./lib/visitor-activity";

const stopClickTracking = installMarketingClickTracking();
if (import.meta.hot) import.meta.hot.dispose(stopClickTracking);
const stopVisitorActivity = installVisitorActivity();
if (import.meta.hot) import.meta.hot.dispose(stopVisitorActivity);

createRoot(document.getElementById("root")!).render(<App />);
