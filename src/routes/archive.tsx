import { createFileRoute } from '@tanstack/react-router'
import { AppLayout } from '../components/app-layout'
import { Archive, FileText, Image, Upload } from 'lucide-react'
import siteMetadata from '../metadata.json'

const SITE_ORIGIN = 'https://nosgzqflza19pn0bs55f4iba.macaly.app'

export const Route = createFileRoute('/archive')({
  head: () => {
    const page = siteMetadata['/archive']
    return {
      meta: [
        { title: page.title },
        { name: 'description', content: page.description },
        { property: 'og:title', content: page.title },
        { property: 'og:description', content: page.description },
        { property: 'og:image', content: siteMetadata.default?.openGraph?.images },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
      links: [{ rel: 'canonical', href: `${SITE_ORIGIN}/archive` }],
    }
  },
  component: ArchivePage,
})

function ArchivePage() {
  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Archive className="size-6 text-primary" />
          <h1 className="text-2xl font-bold">Archív</h1>
        </div>
        <p className="text-muted-foreground">
          Všetky nahraté dokumenty, fotografie a dôkazy k dispozícii na jednom mieste.
        </p>

        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card py-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Upload className="size-4" />
          Nahrať dokument alebo fotografiu
        </button>

        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <FileText className="size-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">Výpoveď svedka 1</p>
                <p className="text-xs text-muted-foreground">PDF • 0 kB</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Image className="size-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">Fotografia miesta činu</p>
                <p className="text-xs text-muted-foreground">JPG • 0 kB</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
