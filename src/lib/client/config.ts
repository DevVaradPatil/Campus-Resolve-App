"use client";

import { useEffect, useState } from "react";
import type { EmergencyContact } from "@/components/notices";
import type { Block, Category } from "@/lib/domain/schemas";
import { api } from "./api";

export type FormConfig = {
  categories: Category[];
  blocks: Block[];
  emergencyContacts: EmergencyContact[];
};

// One fetch per page load; config changes rarely and a reload picks up edits.
let cached: Promise<FormConfig> | null = null;

export function useHostelConfig() {
  const [state, setState] = useState<{ config?: FormConfig; error?: string }>({});
  useEffect(() => {
    cached ??= api<FormConfig>("/api/config");
    cached.then(
      (config) => setState({ config }),
      (e: Error) => {
        cached = null;
        setState({ error: e.message });
      },
    );
  }, []);
  return state;
}
