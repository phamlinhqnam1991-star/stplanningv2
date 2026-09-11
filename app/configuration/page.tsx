import { AppShell } from "@/components/AppShell";
import { ConfigurationConsole } from "@/components/ConfigurationConsole";
import { PageHeader } from "@/components/PageHeader";

export default function ConfigurationPage() {
  return <AppShell><div className="page"><PageHeader code="CFG-90" title="Configuration Center" description="Central extensibility layer for sources, masters, mappings, rules, settings and shared views." /><ConfigurationConsole /></div></AppShell>;
}
