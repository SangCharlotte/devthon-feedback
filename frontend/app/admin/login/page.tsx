import type { Metadata } from "next";

import { LoginForm } from "@/components/admin/LoginForm";

export const metadata: Metadata = {
  title: "Sign in · Company X Paints",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main style={{ padding: 16 }}>
      <LoginForm />
    </main>
  );
}
