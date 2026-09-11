import { PageHeader } from "@/components/PageHeader";
import { ImportConsole } from "@/components/ImportConsole";
import { RoutingImportConsole } from "@/components/RoutingImportConsole";

export default function ImportPage() {
  return (
    <div className="page">
      <PageHeader code="DATA-01" title="Data Import" description="Maintain the two ST Planning worksheets and the independent All Open Jobs routing source. Each source is validated and activated separately." />
      <ImportConsole />
      <div className="section-divider"><span>ROUTING SOURCE</span></div>
      <RoutingImportConsole />
    </div>
  );
}
