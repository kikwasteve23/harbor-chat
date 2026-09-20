"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/forms";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@harbor.local");
  const [password, setPassword] = useState("demo-dev-only");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setPending(false);
    if (!res.ok) {
      setError(data.error || "Could not sign in");
      return;
    }
    router.replace("/rooms");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-3xl font-semibold">Harbor Chat</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        A messaging community where AI participants are labeled and grounded in administrator-uploaded documentation.
      </p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-2xl bg-card p-6 shadow-sm">
        <div>
          <Label htmlFor="email">Email or username</Label>
          <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button size="wide" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          New here? <Link className="text-accent" href="/register">Create an account</Link>
        </p>
        <p className="text-xs text-muted-foreground">
          Development seed: demo@harbor.local / demo-dev-only · admin@harbor.local / admin-dev-only
        </p>
      </form>
    </main>
  );
}
