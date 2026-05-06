"use client";

import { useEffect } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

export function ReadySignal() {
  useEffect(() => {
    sdk.actions.ready().catch(() => {
      // not running inside a mini-app host — ignore
    });
  }, []);
  return null;
}
