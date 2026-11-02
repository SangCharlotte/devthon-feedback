import type { Metadata } from "next";

import { Dashboard } from "@/components/admin/Dashboard";

export const metadata: Metadata = {
  title: "Dashboard · Company X Paints",
  robots: { index: false, follow: false }, // keep the admin area out of search engines
};

export default function AdminPage() {
  return <Dashboard />;
}
