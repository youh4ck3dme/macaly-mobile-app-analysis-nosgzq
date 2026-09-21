import { createFileRoute, Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useQuery } from 'convex/react'
import { Archive, FileText, Image, LoaderCircle, Upload } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { AppLayout } from '../components/app-layout'
import { AuthWrapper } from '../components/auth-wrapper'
import siteMetadata from '../metadata.json'

const SITE_ORIGIN = 'https://forenx.bizagent.sk'

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

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} kB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function fileFormat(file: { filename: string; format?: string }) {
  return (file.format || file.filename.split('.').pop() || 'súbor').toUpperCase()
}

function ArchivePage() {
  const result = useQuery(api.files.listMyFiles, {})

  let content: ReactNode
  let state: 'loading' | 'ready' | 'error' = 'ready'

  if (result === undefined) {
    state = 'loading'
    content = (
      <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin" />
        <p className="text-sm">Načítavam dokumenty...</p>
      </div>
    )
  } else if (!result.ok) {
    state = 'error'
    content = <p className="py-10 text-center text-sm text-destructive">{result.message}</p>
  } else if (result.files.length === 0) {
    content = (
      <div className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
        <Archive className="size-10" />
        <p className="text-sm">Zatiaľ nemáte nahraté žiadne dokumenty.</p>
        <Link className="text-sm font-medium text-primary hover:underline" to="/sandbox">
          Nahrať dokument v sandboxe
        </Link>
      </div>
    )
  } else {
    const totalSize = result.files.reduce((sum, file) => sum + file.size, 0)
    content = (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{result.files.length} dokumentov</span>
          <span>{formatSize(totalSize)} spolu</span>
        </div>
        {result.files.map((file) => {
          const isImage = file.contentType.startsWith('image/')
          return (
            <div
              key={file._id}
              data-testid="archive-file"
              data-filename={file.filename}
              className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                {isImage ? <Image className="size-5 text-muted-foreground" /> : <FileText className="size-5 text-muted-foreground" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {fileFormat(file)} • {formatSize(file.size)} • {new Date(file.uploadedAt).toLocaleDateString('sk-SK')}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <AuthWrapper>
      <AppLayout>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Archive className="size-6 text-primary" />
            <h1 className="text-2xl font-bold">Archív</h1>
          </div>
          <p className="text-muted-foreground">Všetky nahraté dokumenty, fotografie a dôkazy k dispozícii na jednom mieste.</p>
          <Link
            to="/sandbox"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card py-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Upload className="size-4" />
            Nahrať dokument v sandboxe
          </Link>
          <div data-testid="archive-list" data-state={state} className="space-y-3">
            {content}
          </div>
        </div>
      </AppLayout>
    </AuthWrapper>
  )
}
