"use client";

import { useEffect } from "react";
import { useApp } from "./store";

/** Runs the auth/session hydration exactly once per page load. */
let bootstrapped = false;

export function useBootstrap() {
  const init = useApp((s) => s.init);
  useEffect(() => {
    if (!bootstrapped) {
      bootstrapped = true;
      void init();
    }
  }, [init]);
}
