import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { readPoolStatus } from "@/lib/pool-status";
import { AdminPoolControls } from "./admin-pool-controls";

export const dynamic = "force-dynamic";

export default async function AdminPoolPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login?next=/admin/pool");
  }
  const initial = await readPoolStatus();

  return (
    <main className="container max-w-3xl pb-20 pt-10 sm:pt-14">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Property Admin · Pool Controls
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight text-foreground">
            Pondview Pool
          </h1>
        </div>
        <a
          href="/"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Resident view
        </a>
      </header>

      <div className="mt-10">
        <AdminPoolControls initial={initial} />
      </div>
    </main>
  );
}
