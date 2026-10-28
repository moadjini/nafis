"use client";

import { createContext, useContext } from "react";
import type { Viewer } from "./app-shell";

const ViewerContext = createContext<Viewer | null>(null);

export const ViewerProvider = ViewerContext.Provider;

/** The signed-in viewer inside the app shell (null elsewhere). UI hints only. */
export function useViewer() {
  return useContext(ViewerContext);
}
