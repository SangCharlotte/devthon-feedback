import type { Metadata } from "next";

import { AlertsView } from "@/components/admin/AlertsView";

export const metadata: Metadata = { title: "Alerts · Company X Paints" };

export default function Page() {
  return <AlertsView />;
}
