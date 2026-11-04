import type { Metadata } from "next";

import { ReportsView } from "@/components/admin/ReportsView";

export const metadata: Metadata = { title: "Reports · Company X Paints" };

export default function Page() {
  return <ReportsView />;
}
