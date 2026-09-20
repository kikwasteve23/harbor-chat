import Link from "next/link";
import { loginAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/forms";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-3xl font-semibold">Harbor Chat</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        A messaging community where AI participants are labeled and grounded in administrator-uploaded documentation.
      </p>
      <form action={loginAction} method="post" className="mt-8 space-y-4 rounded-2xl bg-card p-6 shadow-sm">
        <div>
          <Label htmlFor="email">Email or username</Label>
          <Input
            id="email"
            name="email"
            defaultValue="demo@harbor.local"
            autoComplete="username"
            className="mt-1"
            required
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            defaultValue="demo-dev-only"
            autoComplete="current-password"
            className="mt-1"
            required
          />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" size="wide">
          Sign in
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link className="text-accent" href="/register">
            Create an account
          </Link>
        </p>
        <p className="text-xs text-muted-foreground">
          Development seed: demo@harbor.local / demo-dev-only · admin@harbor.local / admin-dev-only
        </p>
      </form>
    </main>
  );
}
