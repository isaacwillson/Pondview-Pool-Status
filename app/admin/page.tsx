import { redirect } from "next/navigation";
import { ArrowUpRight, Database, ExternalLink, SlidersHorizontal } from "lucide-react";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { readPoolStatus } from "@/lib/pool-status";
import { deriveEffectivePoolStatus } from "@/lib/effective-status";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login?next=/admin");
  }

  const status = await readPoolStatus();
  const effective = deriveEffectivePoolStatus(status);

  return (
    <main className="container max-w-4xl pb-24 pt-10 sm:pt-14">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Property Admin
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight text-foreground">
            Pondview Pool
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Manage what residents see. Pick where you want to go.
          </p>
        </div>
        <SignOutButton />
      </header>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DashboardCard
          href="/admin/pool"
          icon={<SlidersHorizontal className="h-5 w-5" />}
          accent="pond"
          title="Open / Close"
          description="Force the pool closed or return it to the normal schedule."
        >
          <Badge variant={effective.isOpen ? "success" : "warning"}>
            {effective.isOpen ? "Open now" : "Closed now"}
          </Badge>
        </DashboardCard>

        <DashboardCard
          href="/admin/data"
          icon={<Database className="h-5 w-5" />}
          accent="amber"
          title="Data Editor"
          description="Review, edit, or add the occupancy readings behind the charts."
        />

        <DashboardCard
          href="/"
          icon={<ExternalLink className="h-5 w-5" />}
          accent="emerald"
          title="Resident View"
          description="See the public dashboard exactly as residents see it."
        />
      </div>
    </main>
  );
}

const ACCENT_STYLES = {
  pond: "bg-pond-50 text-pond-600",
  amber: "bg-amber-50 text-amber-600",
  emerald: "bg-emerald-50 text-emerald-600",
};

function DashboardCard({
  href,
  icon,
  accent,
  title,
  description,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  accent: keyof typeof ACCENT_STYLES;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <a href={href} className="group block focus-visible:outline-none">
      <Card className="flex h-full flex-col p-6 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_2px_4px_rgba(20,37,49,0.04),0_18px_36px_-18px_rgba(20,37,49,0.18)] group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2">
        <div className="flex items-start justify-between">
          <span
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-xl",
              ACCENT_STYLES[accent],
            )}
          >
            {icon}
          </span>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
        </div>

        <h2 className="mt-5 font-display text-2xl font-normal tracking-tight text-foreground">
          {title}
        </h2>
        <p className="mt-1.5 flex-1 text-sm text-muted-foreground">
          {description}
        </p>

        {children ? <div className="mt-4">{children}</div> : null}
      </Card>
    </a>
  );
}
