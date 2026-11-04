import type { Metadata } from "next";

import { LoginForm } from "@/components/admin/LoginForm";
import { LoginScreen } from "@/components/admin/LoginScreen";

export const metadata: Metadata = {
  title: "Sign in · Company X Paints",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <LoginScreen>
      <LoginForm />
    </LoginScreen>
  );
}
