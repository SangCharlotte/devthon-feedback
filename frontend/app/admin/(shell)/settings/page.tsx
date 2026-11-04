import type { Metadata } from "next";

import { SettingsView } from "@/components/admin/SettingsView";

export const metadata: Metadata = { title: "Settings · Company X Paints" };

export default function Page() {
  return <SettingsView />;
}
