import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AgentForm } from "@/components/agent-form";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default function NewAgentPage() {
  return (
    <>
      <PageHeader
        title="New agent"
        subtitle="Give it a job description. You'll add schedules next."
        action={
          <Link href="/agents" className="btn btn-secondary">
            <ArrowLeft size={15} />
            Back
          </Link>
        }
      />
      <div className="mx-auto w-full max-w-[720px] p-4 sm:p-5">
        <AgentForm agent={null} />
      </div>
    </>
  );
}
