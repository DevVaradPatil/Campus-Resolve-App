import { LoginForm } from "@/components/auth-forms";

export const metadata = { title: "Admin sign in · CampusResolve" };

export default function AdminLoginPage() {
  return <LoginForm admin />;
}
