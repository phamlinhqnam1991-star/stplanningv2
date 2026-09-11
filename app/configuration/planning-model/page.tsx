import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { PlanningModelConsole } from "@/components/PlanningModelConsole";

export default function PlanningModelPage() {
  return <AppShell><div className="page"><PageHeader code="CFG-91" title="Planning Model" description="Configure operation classification, Main Operations and reusable planning hierarchy without changing source data." /><PlanningModelConsole /></div></AppShell>;
}
