import { createFileRoute, Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useQuery } from 'convex/react'
import { FileText, LoaderCircle, Network, Share2, Users } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { AppLayout } from '../components/app-layout'
import { AuthWrapper } from '../components/auth-wrapper'
import siteMetadata from '../metadata.json'

const SITE_ORIGIN = 'https://forenx.bizagent.sk'

type GraphPerson = { id?: string; _id?: string; name?: string }
type GraphRelationship = { person1_id?: string; person2_id?: string; type?: string; description?: string }
type GraphData = { persons?: unknown; relationships?: unknown; evidence?: unknown; timeline?: unknown }

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
  const result = useQuery(api.analyses.listMyAnalyses, {})
  let state: 'loading' | 'ready' | 'error' = 'ready'
  let content: ReactNode

  if (result === undefined) {
    state = 'loading'
    content = (
      <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin" />
        <p className="text-sm">Načítavam analýzy...</p>
      </div>
    )
  } else if (!result.ok) {
    state = 'error'
    content = <p className="py-10 text-center text-sm text-destructive">{result.message}</p>
  } else {
    const analysis = result.analyses.find((item) => item.status === 'ready' && item.data != null)
    if (!analysis) {
      content = (
        <div className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
          <Network className="size-10" />
          <p className="text-sm">Zatiaľ nemáte pripravenú analýzu pre graf vzťahov.</p>
          <Link className="text-sm font-medium text-primary hover:underline" to="/sherlock">
            Spustiť analýzu v Sherlocku
          </Link>
        </div>
      )
    } else {
      const data = (analysis.data ?? {}) as GraphData
      const persons = Array.isArray(data.persons) ? (data.persons as GraphPerson[]) : []
      const relationships = Array.isArray(data.relationships) ? (data.relationships as GraphRelationship[]) : []
      const evidence = Array.isArray(data.evidence) ? data.evidence : []
      const timeline = Array.isArray(data.timeline) ? data.timeline : []
      const names = new Map<string, string>()
      persons.forEach((person) => {
        const id = person.id ?? person._id
        if (id) names.set(id, person.name || id)
      })
      const personName = (id?: string) => (id ? names.get(id) ?? id : 'Neznáma osoba')

      content = (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={<Users className="mx-auto mb-2 size-6 text-chart-2" />} label="Osoby" value={persons.length} />
            <Stat icon={<Share2 className="mx-auto mb-2 size-6 text-chart-4" />} label="Vzťahy" value={relationships.length} />
            <Stat icon={<FileText className="mx-auto mb-2 size-6 text-chart-3" />} label="Dôkazy" value={evidence.length} />
            <Stat icon={<Network className="mx-auto mb-2 size-6 text-chart-1" />} label="Udalosti" value={timeline.length} />
          </div>
          {persons.length === 0 && relationships.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Táto analýza neobsahuje vzťahy ani osoby.
            </div>
          ) : relationships.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Táto analýza neobsahuje vzťahy.
            </div>
          ) : (
            <div className="space-y-3">
              {relationships.map((relationship, index) => (
                <div key={`${relationship.person1_id ?? 'relation'}-${relationship.person2_id ?? index}-${index}`} data-testid="graph-relation" className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <span className="truncate">{personName(relationship.person1_id)}</span>
                    <span className="shrink-0 text-muted-foreground">↔</span>
                    <span className="truncate">{personName(relationship.person2_id)}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{relationship.type || 'Vzťah'}{relationship.description ? ` • ${relationship.description}` : ''}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
  }

  return (
    <AuthWrapper>
      <AppLayout>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Network className="size-6 text-primary" />
            <h1 className="text-2xl font-bold">Graf vzťahov</h1>
          </div>
          <p className="text-muted-foreground">Vizualizácia osôb, spojení a prepojení medzi výpoveďami v prípade.</p>
          <div data-testid="graph-view" data-state={state}>{content}</div>
        </div>
      </AppLayout>
    </AuthWrapper>
  )
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center shadow-sm">
      {icon}
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{value}</p>
    </div>
  )
}
