import { PageHeader } from "@/components/PageHeader";
import { RoutingExplorer } from "@/components/RoutingExplorer";

export default function RoutingPage() {
  return (
    <div className="page">
      <PageHeader code="ROUTE-05" title="Job Routing" description="Authoritative full Job operation sequence imported from All Open Jobs. Completion, NextOperation and OprSeq are preserved directly from the source." />
      <RoutingExplorer />
    </div>
  );
}
