import type { Metadata } from "next";

import { DashboardView } from "@/components/admin/DashboardView";

export const metadata: Metadata = { title: "Dashboard · Company X Paints" };

export default function Page() {
  return <DashboardView />;
}
