import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ConfigurationConsole } from "@/components/ConfigurationConsole";
import { PageHeader } from "@/components/PageHeader";

export default function ConfigurationPage() {
  return <AppShell><div className="page"><PageHeader code="CFG-90" title="Configuration Center" description="Central extensibility layer for sources, masters, mappings, rules, settings and shared views." /><section className="panel config-workbench-link"><div><span className="eyebrow">SPECIALIZED CONFIGURATION</span><h2>Planning Model Workbench</h2><p>Use the guided matrix to classify imported operations into Main Operations and configure the reusable ST Group → Area → Planner hierarchy.</p></div><Link className="button primary" href="/configuration/planning-model">Open CFG-91</Link></section><ConfigurationConsole /></div></AppShell>;
}
