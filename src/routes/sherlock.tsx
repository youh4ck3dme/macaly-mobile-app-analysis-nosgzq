import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "../components/app-layout";
import { AuthWrapper } from "../components/auth-wrapper";
import { SherlockAnalyzer } from "../components/sherlock-analyzer";
import { Bot } from "lucide-react";
import siteMetadata from "../metadata.json";

const SITE_ORIGIN = "https://forenx.bizagent.sk";

export const Route = createFileRoute("/sherlock")({
  head: () => {
    const page = siteMetadata["/sherlock"];
    return {
      meta: [
        { title: page.title },
        { name: "description", content: page.description },
        { property: "og:title", content: page.title },
        { property: "og:description", content: page.description },
        { property: "og:image", content: siteMetadata.default?.openGraph?.images },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: `${SITE_ORIGIN}/sherlock` }],
    };
  },
  component: SherlockPage,
});

function SherlockPage() {
  return (
    <AuthWrapper>
      <AppLayout>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Bot className="size-6 text-primary" />
            <h1 className="text-2xl font-bold">Sherlock AI Analyzer</h1>
          </div>
          <p className="text-muted-foreground">
            Vyberte PDF z vášho sandboxu alebo nahrajte nový. Sherlock z dokumentu
            extrahuje časovú os, osoby, dôkazy a vzťahy.
          </p>
          <SherlockAnalyzer />
        </div>
      </AppLayout>
    </AuthWrapper>
  );
}
