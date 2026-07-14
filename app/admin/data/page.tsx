import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isDbConfigured } from "@/lib/db";
import { listReadings } from "@/lib/occupancy-history";
import { POOL_CAPACITY, POOL_TIMEZONE } from "@/lib/config";
import { AdminDataTable } from "./data-table";

export const dynamic = "force-dynamic";

export default async function AdminDataPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login?next=/admin/data");
  }

  const { rows, total } = await listReadings({ limit: 200 });
  const initialRows = rows.map((r) => ({
    id: r.id,
    occupancy: r.occupancy,
    capacity: r.capacity,
    recordedAt: r.recordedAt.toISOString(),
  }));

  return (
    <main className="container max-w-5xl pb-24 pt-10 sm:pt-14">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Property Admin · Occupancy Data
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight text-foreground">
            Data Editor
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Every occupancy reading behind the dashboard — from the camera feed
            or seeded mock data. Edit values, fix timestamps, or add your own
            data points; the charts and stats recompute from this table.
          </p>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <a
            href="/admin/pool"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Pool controls
          </a>
          <a
            href="/"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Resident view
          </a>
        </nav>
      </header>

      <div className="mt-10">
        <AdminDataTable
          initialRows={initialRows}
          total={total}
          dbConnected={isDbConfigured()}
          defaultCapacity={POOL_CAPACITY}
          timezone={POOL_TIMEZONE}
        />
      </div>
    </main>
  );
}
