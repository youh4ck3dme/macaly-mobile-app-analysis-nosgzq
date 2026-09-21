import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "../components/app-layout";
import { AuthWrapper } from "../components/auth-wrapper";
import { PdfSandboxUpload } from "../components/pdf-sandbox-upload";
import { FlaskConical } from "lucide-react";
import siteMetadata from "../metadata.json";

const SITE_ORIGIN = "https://nosgzqflza19pn0bs55f4iba.macaly.app";

export const Route = createFileRoute("/sandbox")({
  head: () => {
    const page = siteMetadata["/sandbox"];
    return {
      meta: [
        { title: page.title },
        { name: "description", content: page.description },
        { property: "og:title", content: page.title },
        { property: "og:description", content: page.description },
        { property: "og:image", content: siteMetadata.default?.openGraph?.images },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: `${SITE_ORIGIN}/sandbox` }],
    };
  },
  component: SandboxPage,
});

function SandboxPage() {
  return (
    <AuthWrapper>
      <AppLayout>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="size-6 text-primary" />
            <h1 className="text-2xl font-bold">Dokumentový sandbox</h1>
          </div>
          <p className="text-muted-foreground">
            Nahrajte PDF, DOCX alebo textový dokument až do veľkosti 200 MB. Súbor sa uloží do
            bezpečného Convex storage a zobrazí sa iba vám.
          </p>
          <PdfSandboxUpload />
        </div>
      </AppLayout>
    </AuthWrapper>
  );
}
