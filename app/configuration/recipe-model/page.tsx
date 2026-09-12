import { PageHeader } from "@/components/PageHeader";
import { RecipeModelConsole } from "@/components/RecipeModelConsole";

export default function RecipeModelPage() {
  return <div className="page"><PageHeader code="CFG-92" title="Recipe & Process Time" description="Configure Recipe No., Recipe Name, Recipe Rules, Process Time and Process Time Rules from source data without hard-coded planning logic." /><RecipeModelConsole /></div>;
}
