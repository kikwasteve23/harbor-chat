import Link from "next/link";
import { registerAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/forms";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-3xl font-semibold">Create your Harbor account</h1>
      <form action={registerAction} method="post" className="mt-8 space-y-4 rounded-2xl bg-card p-6 shadow-sm">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" className="mt-1" required />
        </div>
        <div>
          <Label htmlFor="username">Username</Label>
          <Input id="username" name="username" className="mt-1" required />
        </div>
        <div>
          <Label htmlFor="displayName">Display name</Label>
          <Input id="displayName" name="displayName" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="password">Password (8+ characters)</Label>
          <Input id="password" name="password" type="password" className="mt-1" required />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" size="wide">
          Create account
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link className="text-accent" href="/login">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
