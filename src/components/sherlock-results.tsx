import { useMemo, useState } from "react";
import {
  Clock,
  Users,
  FileText,
  Link2,
  Search,
  ChevronDown,
  MapPin,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type SherlockAnalysis = {
  metadata?: {
    document_name?: string;
    upload_date?: string;
    page_count?: number;
    language?: string;
    [key: string]: unknown;
  };
  persons?: Array<{
    id: string;
    name: string;
    role?: string;
    description?: string;
  }>;
  evidence?: Array<{
    id: string;
    type?: string;
    content?: string;
    source?: string;
    relevance_score?: number;
  }>;
  relationships?: Array<{
    person1_id?: string;
    person2_id?: string;
    type?: string;
    description?: string;
    evidence_supporting?: string[];
  }>;
  timeline?: Array<{
    id: string;
    timestamp?: string | null;
    title?: string;
    description?: string;
    location?: string;
    persons_involved?: string[];
    evidence_links?: string[];
    tags?: string[];
    source_text?: string;
    confidence?: number;
    approximate?: boolean;
  }>;
};

function formatTimestamp(ts?: string | null): string {
  if (!ts) return "Neznámy čas";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  return date.toLocaleString("sk-SK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SherlockResults({
  analysis,
}: {
  analysis: SherlockAnalysis;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const persons = analysis.persons ?? [];
  const evidence = analysis.evidence ?? [];
  const relationships = analysis.relationships ?? [];
  const timeline = analysis.timeline ?? [];

  const personById = useMemo(() => {
    const map = new Map<string, { name: string; role?: string }>();
    for (const p of persons) map.set(p.id, { name: p.name, role: p.role });
    return map;
  }, [persons]);

  const evidenceById = useMemo(() => {
    const map = new Map<string, { content?: string; type?: string }>();
    for (const e of evidence) map.set(e.id, { content: e.content, type: e.type });
    return map;
  }, [evidence]);

  const sortedTimeline = useMemo(() => {
    return [...timeline].sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : Number.POSITIVE_INFINITY;
      return ta - tb;
    });
  }, [timeline]);

  const lowerSearch = searchTerm.toLowerCase();
  const filteredTimeline = useMemo(() => {
    if (!lowerSearch) return sortedTimeline;
    return sortedTimeline.filter((event) => {
      const haystack = [
        event.title,
        event.description,
        event.location,
        event.source_text,
        ...(event.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(lowerSearch);
    });
  }, [sortedTimeline, lowerSearch]);

  const sortedEvidence = useMemo(
    () => [...evidence].sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0)),
    [evidence],
  );

  if (timeline.length === 0 && persons.length === 0 && evidence.length === 0) {
    return (
      <div
        className="flex items-center gap-3 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground"
        data-testid="sherlock-no-results"
      >
        <AlertTriangle className="size-5 shrink-0" />
        <span>Analýza neobsahuje žiadne zistené udalosti, osoby ani dôkazy.</span>
      </div>
    );
  }

  return (
    <div className="space-y-8" data-testid="sherlock-results">
      {/* Metadata */}
      {analysis.metadata && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            <h2 className="text-base font-bold">
              {analysis.metadata.document_name ?? "Analýza dokumentu"}
            </h2>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
            {analysis.metadata.page_count != null && (
              <div>
                <span className="block text-xs text-muted-foreground">Počet strán</span>
                <span className="font-medium">{analysis.metadata.page_count}</span>
              </div>
            )}
            {analysis.metadata.language && (
              <div>
                <span className="block text-xs text-muted-foreground">Jazyk</span>
                <span className="font-medium uppercase">
                  {analysis.metadata.language}
                </span>
              </div>
            )}
            {analysis.metadata.upload_date && (
              <div>
                <span className="block text-xs text-muted-foreground">Dátum</span>
                <span className="font-medium">
                  {new Date(analysis.metadata.upload_date).toLocaleDateString("sk-SK")}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
        <section data-testid="sherlock-timeline">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="size-5 text-primary" />
            <h2 className="text-lg font-bold">Časová os</h2>
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {filteredTimeline.length}/{timeline.length}
            </span>
          </div>

          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Vyhľadaj v časovej osi (napr. 14:30, meno, krádež)..."
              className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
              data-testid="sherlock-search"
            />
          </div>

          {filteredTimeline.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Žiadne udalosti nezodpovedajú vyhľadávaniu.
            </p>
          ) : (
            <div className="relative">
              <div className="absolute bottom-2 left-[9px] top-2 w-px bg-border" />
              <ol className="space-y-3">
                {filteredTimeline.map((event) => {
                  const isOpen = expanded === event.id;
                  return (
                    <li key={event.id} className="relative pl-7" data-testid="timeline-event">
                      <span className="absolute left-0 top-3.5 size-[18px] rounded-full border-2 border-card bg-primary shadow" />
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : event.id)}
                        className="w-full rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/50"
                        data-testid="timeline-event-toggle"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-primary">
                              {formatTimestamp(event.timestamp)}
                              {event.approximate && (
                                <span className="ml-1 text-xs font-normal text-muted-foreground">
                                  (približne)
                                </span>
                              )}
                            </p>
                            <h3 className="mt-0.5 font-bold">{event.title}</h3>
                          </div>
                          <ChevronDown
                            className={cn(
                              "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
                              isOpen && "rotate-180",
                            )}
                          />
                        </div>

                        {event.location && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="size-3" />
                            {event.location}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {event.persons_involved?.map((pid) => {
                            const p = personById.get(pid);
                            return p ? (
                              <span
                                key={pid}
                                className="rounded-full bg-muted px-2 py-0.5 text-xs"
                              >
                                {p.name}
                              </span>
                            ) : null;
                          })}
                          {event.tags?.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                            >
                              #{tag}
                            </span>
                          ))}
                          {event.confidence != null && (
                            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {Math.round(event.confidence * 100)}% istota
                            </span>
                          )}
                        </div>

                        {isOpen && (
                          <div className="mt-3 space-y-3 border-t border-border pt-3 text-sm">
                            {event.description && (
                              <p className="text-foreground">{event.description}</p>
                            )}
                            {event.evidence_links && event.evidence_links.length > 0 && (
                              <div className="space-y-1.5">
                                <span className="text-xs font-medium text-muted-foreground">
                                  Spojené dôkazy:
                                </span>
                                {event.evidence_links.map((eid) => {
                                  const ev = evidenceById.get(eid);
                                  return ev ? (
                                    <div
                                      key={eid}
                                      className="rounded-lg bg-muted p-2 text-xs"
                                    >
                                      {ev.type && (
                                        <span className="font-medium text-primary">
                                          [{ev.type}]
                                        </span>
                                      )}{" "}
                                      {ev.content}
                                    </div>
                                  ) : null;
                                })}
                              </div>
                            )}
                            {event.source_text && (
                              <div className="rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
                                <span className="font-medium">Zdrojový text:</span> "
                                {event.source_text}"
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </section>
      )}

      {/* Osoby */}
      {persons.length > 0 && (
        <section data-testid="sherlock-persons">
          <div className="mb-3 flex items-center gap-2">
            <Users className="size-5 text-primary" />
            <h2 className="text-lg font-bold">Osoby</h2>
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {persons.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {persons.map((person) => (
              <div
                key={person.id}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
                data-testid="person-card"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {person.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold">{person.name}</p>
                    {person.role && (
                      <p className="text-xs text-muted-foreground">{person.role}</p>
                    )}
                  </div>
                </div>
                {person.description && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {person.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Dôkazy */}
      {sortedEvidence.length > 0 && (
        <section data-testid="sherlock-evidence">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            <h2 className="text-lg font-bold">Dôkazy</h2>
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {sortedEvidence.length}
            </span>
          </div>
          <ol className="space-y-2">
            {sortedEvidence.map((e) => (
              <li
                key={e.id}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
                data-testid="evidence-item"
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {e.relevance_score ?? "–"}
                </span>
                <div className="min-w-0 flex-1">
                  {e.content && (
                    <p className="text-sm text-foreground">{e.content}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {e.type && (
                      <span className="rounded-full bg-muted px-2 py-0.5">
                        {e.type}
                      </span>
                    )}
                    {e.source && <span>{e.source}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Vzťahy */}
      {relationships.length > 0 && (
        <section data-testid="sherlock-relationships">
          <div className="mb-3 flex items-center gap-2">
            <Link2 className="size-5 text-primary" />
            <h2 className="text-lg font-bold">Vzťahy medzi osobami</h2>
          </div>
          <div className="space-y-2">
            {relationships.map((rel, idx) => {
              const p1 = rel.person1_id ? personById.get(rel.person1_id) : undefined;
              const p2 = rel.person2_id ? personById.get(rel.person2_id) : undefined;
              if (!p1 || !p2) return null;
              return (
                <div
                  key={`${rel.person1_id}-${rel.person2_id}-${idx}`}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm"
                  data-testid="relationship-item"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{p1.name}</span>
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      {rel.type ?? "vzťah"}
                    </span>
                    <span className="font-bold">{p2.name}</span>
                  </div>
                  {rel.description && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {rel.description}
                    </p>
                  )}
                  {rel.evidence_supporting && rel.evidence_supporting.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Podporené dôkazmi:{" "}
                      {rel.evidence_supporting
                        .map((eid) => evidenceById.get(eid)?.content ?? eid)
                        .join(", ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
