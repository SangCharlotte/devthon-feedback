import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  robots: { index: false, follow: false }, // keep the admin area out of search engines
};

export default function ShellLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
