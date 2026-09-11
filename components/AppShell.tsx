"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/", code: "SYS-00", label: "Overview" },
  { href: "/import", code: "DATA-01", label: "Data Import" },
  { href: "/routing", code: "ROUTE-05", label: "Job Routing" },
  { href: "/planning", code: "PLAN-10", label: "Planning" },
  { href: "/scheduling", code: "SCH-20", label: "Scheduling" },
  { href: "/configuration", code: "CFG-90", label: "Configuration" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">ST</div>
          <div>
            <div className="brand-title">ST PLANNING</div>
            <div className="brand-subtitle">Production Control</div>
          </div>
        </div>
        <div className="nav-caption">OPERATIONS</div>
        <nav className="nav-list">
          {nav.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link className={`nav-item ${active ? "active" : ""}`} href={item.href} key={item.href}>
                <span className="nav-code">{item.code}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <span className="status-dot" />
          <div>
            <strong>Clean Rebuild v010</strong>
            <small>Configuration-First Architecture</small>
          </div>
        </div>
      </aside>
      <main className="main-area">{children}</main>
    </div>
  );
}
