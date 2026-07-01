"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc-client";

type ProjectListItem = {
  id: string;
  name: string;
  _count: { racks: number };
};

/**
 * Collapsible left navigation. Lists projects, and lazily expands each into its
 * racks so users can jump project→project and rack→rack without going back to a
 * dashboard. The whole rail animates to zero width when `collapsed`; the inner
 * column keeps a fixed width so its contents don't reflow mid-animation.
 */
export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname() ?? "";
  const projects = trpc.project.list.useQuery();

  const activeProjectId = pathname.startsWith("/projects/")
    ? pathname.split("/")[2]
    : undefined;
  const activeRackId = pathname.startsWith("/racks/")
    ? pathname.split("/")[2]
    : undefined;

  // Resolve the project that owns the current rack so we can auto-expand it.
  // This query is already cached by the rack workspace, so it's essentially free.
  const activeRack = trpc.rack.get.useQuery(
    { id: activeRackId ?? "" },
    { enabled: !!activeRackId },
  );
  const rackProjectId = activeRack.data?.project.id;

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Keep the project for the current route open.
  useEffect(() => {
    const pid = activeProjectId ?? rackProjectId;
    if (pid) setExpanded((e) => (e[pid] ? e : { ...e, [pid]: true }));
  }, [activeProjectId, rackProjectId]);

  return (
    <aside
      className={`sticky top-0 z-30 h-screen shrink-0 overflow-hidden border-r border-slate-200 bg-white/70 backdrop-blur transition-[width] duration-200 ease-out ${
        collapsed ? "w-0" : "w-64"
      }`}
    >
      <div className="flex h-full w-64 flex-col">
        <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4">
          <Link
            href="/dashboard"
            className="group flex items-center gap-2 transition active:scale-95 motion-reduce:transform-none"
          >
            <span className="brand-gradient h-7 w-7 rounded-lg shadow-sm transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3 motion-reduce:transform-none" />
            <span className="text-lg font-bold tracking-tight">
              Lab<span className="brand-text">Test</span>
            </span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <NavLink href="/dashboard" active={pathname === "/dashboard"}>
            <GridIcon />
            All projects
          </NavLink>

          <div className="mt-4 flex items-center justify-between px-2 pb-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Projects
            </span>
            {projects.data && (
              <span className="text-xs text-slate-400">{projects.data.length}</span>
            )}
          </div>

          {projects.isLoading ? (
            <p className="px-3 py-2 text-sm text-slate-400">Loading…</p>
          ) : projects.data && projects.data.length > 0 ? (
            projects.data.map((p) => (
              <ProjectItem
                key={p.id}
                project={p}
                expanded={!!expanded[p.id]}
                onToggle={() =>
                  setExpanded((e) => ({ ...e, [p.id]: !e[p.id] }))
                }
                activeProjectId={activeProjectId}
                activeRackId={activeRackId}
              />
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-slate-400">No projects yet.</p>
          )}
        </nav>
      </div>
    </aside>
  );
}

function ProjectItem({
  project,
  expanded,
  onToggle,
  activeProjectId,
  activeRackId,
}: {
  project: ProjectListItem;
  expanded: boolean;
  onToggle: () => void;
  activeProjectId?: string;
  activeRackId?: string;
}) {
  const racks = trpc.rack.listByProject.useQuery(
    { projectId: project.id },
    { enabled: expanded },
  );
  const isActive = project.id === activeProjectId;

  return (
    <div>
      <div
        className={`group flex items-center rounded-lg transition ${
          isActive ? "bg-accent-blue/10" : "hover:bg-slate-100"
        }`}
      >
        <button
          onClick={onToggle}
          aria-label={expanded ? "Collapse project" : "Expand project"}
          className="flex h-8 w-7 items-center justify-center text-slate-400 hover:text-slate-600"
        >
          <Chevron open={expanded} />
        </button>
        <Link
          href={`/projects/${project.id}`}
          className={`flex flex-1 items-center justify-between gap-2 truncate py-1.5 pr-2 text-sm ${
            isActive ? "font-semibold text-accent-blue" : "text-slate-700"
          }`}
        >
          <span className="truncate">{project.name}</span>
          <span className="shrink-0 text-xs text-slate-400">
            {project._count.racks}
          </span>
        </Link>
      </div>

      {expanded && (
        <div className="ml-4 border-l border-slate-200 pl-2">
          {racks.isLoading ? (
            <p className="px-2 py-1.5 text-xs text-slate-400">Loading…</p>
          ) : racks.data && racks.data.length > 0 ? (
            racks.data.map((r) => (
              <Link
                key={r.id}
                href={`/racks/${r.id}`}
                className={`block truncate rounded-lg px-2 py-1.5 text-sm transition ${
                  r.id === activeRackId
                    ? "bg-accent-purple/10 font-medium text-accent-purple"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {r.name}
              </Link>
            ))
          ) : (
            <p className="px-2 py-1.5 text-xs text-slate-400">No racks</p>
          )}
        </div>
      )}
    </div>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-accent-blue/10 text-accent-blue"
          : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </Link>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={`h-4 w-4 transition-transform duration-200 ${
        open ? "rotate-90" : ""
      }`}
    >
      <path
        d="M7.5 5l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <rect x="2.5" y="2.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
