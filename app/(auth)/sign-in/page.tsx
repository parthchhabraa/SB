import { AuthForm } from "@/components/auth-form";
import { signIn } from "@/app/auth-actions";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthForm mode="sign-in" action={signIn} next={next} />;
}
