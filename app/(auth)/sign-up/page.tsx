import { AuthForm } from "@/components/auth-form";
import { signUp } from "@/app/auth-actions";

export default function SignUpPage() {
  return <AuthForm mode="sign-up" action={signUp} />;
}
