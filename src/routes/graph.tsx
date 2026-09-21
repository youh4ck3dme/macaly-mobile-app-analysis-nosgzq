import { createFileRoute } from '@tanstack/react-router'
import { AppLayout } from '../components/app-layout'
import { Network, Share2, Users, FileText } from 'lucide-react'
import siteMetadata from '../metadata.json'

const SITE_ORIGIN = 'https://nosgzqflza19pn0bs55f4iba.macaly.app'

export const Route = createFileRoute('/graph')({
  head: () => {
    const page = siteMetadata['/graph']
    return {
      meta: [
        { title: page.title },
        { name: 'description', content: page.description },
        { property: 'og:title', content: page.title },
        { property: 'og:description', content: page.description },
        { property: 'og:image', content: siteMetadata.default?.openGraph?.images },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
      links: [{ rel: 'canonical', href: `${SITE_ORIGIN}/graph` }],
    }
  },
  component: GraphPage,
})

function GraphPage() {
  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Network className="size-6 text-primary" />
          <h1 className="text-2xl font-bold">Graf vzťahov</h1>
        </div>
        <p className="text-muted-foreground">
          Vizualizácia osôb, spojení a prepojení medzi výpoveďami v prípade.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card p-4 text-center shadow-sm">
            <Users className="mx-auto mb-2 size-6 text-chart-2" />
            <p className="text-sm font-medium">Osoby</p>
            <p className="text-xs text-muted-foreground">0 zaznamenaných</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center shadow-sm">
            <Share2 className="mx-auto mb-2 size-6 text-chart-4" />
            <p className="text-sm font-medium">Vzťahy</p>
            <p className="text-xs text-muted-foreground">0 prepojení</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center shadow-sm">
            <FileText className="mx-auto mb-2 size-6 text-chart-3" />
            <p className="text-sm font-medium">Dokumenty</p>
            <p className="text-xs text-muted-foreground">0 vložených</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center shadow-sm">
            <Network className="mx-auto mb-2 size-6 text-chart-1" />
            <p className="text-sm font-medium">Hĺbka</p>
            <p className="text-xs text-muted-foreground">do 3. stupňa</p>
          </div>
        </div>

        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
          <Network className="mx-auto mb-3 size-12 text-muted-foreground/40" />
          <p className="text-sm">V tomto prípade zatiaľ nie sú žiadne dáta na vizualizáciu grafu.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pridajte výpovede a osoby a graf sa vytvorí automaticky.
          </p>
        </div>
      </div>
    </AppLayout>
  )
}
