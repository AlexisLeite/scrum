import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { RootStoreProvider } from "./stores/root-store";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootStoreProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </RootStoreProvider>
  </React.StrictMode>
);
