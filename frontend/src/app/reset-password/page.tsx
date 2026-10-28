import { Suspense } from "react";
import { ResetPassword } from "@/components/PasswordReset";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPassword />
    </Suspense>
  );
}
