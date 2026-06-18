import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (await isAdminAuthenticated()) {
    redirect(safeNext(next));
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Pondview Residences
          </p>
          <h1 className="mt-2 font-display text-3xl tracking-tight text-foreground">
            Property Admin
          </h1>
        </div>

        <LoginForm nextPath={safeNext(next)} />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Resident view ·{" "}
          <a href="/" className="underline-offset-2 hover:underline">
            return to dashboard
          </a>
        </p>
      </div>
    </main>
  );
}

function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/admin/pool";
  }
  return value;
}
