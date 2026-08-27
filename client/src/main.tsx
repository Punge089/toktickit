import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/zen-green.css";
import { AppRouter } from "./AppRouter.js";
import { RequesterProvider } from "./context/RequesterContext.js";

// Lab 1's App.tsx (the "Check System" demo) is superseded by the Lab 2
// Requester-facing screens below, but it and its test are left intact —
// see client/tests/lab-01/App.test.tsx, which renders <App /> directly.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <RequesterProvider>
        <AppRouter />
      </RequesterProvider>
    </BrowserRouter>
  </React.StrictMode>
);
