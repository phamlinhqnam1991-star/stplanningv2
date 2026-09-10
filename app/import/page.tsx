import { PageHeader } from "@/components/PageHeader";
import { ImportConsole } from "@/components/ImportConsole";

export default function ImportPage() {
  return (
    <div className="page">
      <PageHeader code="DATA-01" title="Data Import" description="Import the complete SirusClean_Painting_MasterList and Main Planning used ranges without dropping source rows or columns." />
      <ImportConsole />
    </div>
  );
}
