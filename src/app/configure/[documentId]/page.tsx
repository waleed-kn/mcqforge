import { Suspense } from "react";
import { ConfigurationHandoff } from "@/components/review/configuration-handoff";

type ConfigurationPageProps = {
  params: Promise<{ documentId: string }>;
};

async function ConfigurationContent({ params }: ConfigurationPageProps) {
  const { documentId } = await params;
  return <ConfigurationHandoff documentId={documentId} />;
}

export default function ConfigurationPage({ params }: ConfigurationPageProps) {
  return (
    <Suspense
      fallback={
        <main className="site-shell">
          <p role="status">Loading your confirmed question set…</p>
        </main>
      }
    >
      <ConfigurationContent params={params} />
    </Suspense>
  );
}
