'use client';

import { useEffect, useRef, useState } from 'react';

type Ref = { label: string; detail?: string };
type Endpoint = {
  method: string;
  path: string;
  title: string;
  trigger: string;
  reads: Ref[];
  writes: Ref[];
  outputs: Ref[];
  security: Ref[];
  libs: string[];
  description: string;
};
type Model = {
  service: { name: string };
  endpoints: Endpoint[];
};

// Mermaid wird bewusst per CDN geladen (kein npm-Dependency, Build bleibt unveraendert).
const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

function id(prefix: string, s: string): string {
  return prefix + s.replace(/[^A-Za-z0-9]/g, '_');
}

// Baut die Mermaid-Flowchart-Definition aus dem Modell.
function buildMermaid(model: Model): string {
  const triggers = new Map<string, string>(); // label -> nodeId
  const sources = new Map<string, string>();
  const outputs = new Map<string, string>();
  const lines: string[] = [];
  const edges: string[] = [];

  model.endpoints.forEach((ep, i) => {
    const epId = `ep${i}`;

    if (!triggers.has(ep.trigger)) triggers.set(ep.trigger, id('trig_', ep.trigger));
    const trigId = triggers.get(ep.trigger)!;
    edges.push(`  ${trigId} --> ${epId}`);

    // Lese-/Schreibzugriff pro Datenquelle zusammenfassen
    const access = new Map<string, { read: boolean; write: boolean }>();
    ep.reads.forEach((r) => {
      const a = access.get(r.label) || { read: false, write: false };
      a.read = true;
      access.set(r.label, a);
    });
    ep.writes.forEach((w) => {
      const a = access.get(w.label) || { read: false, write: false };
      a.write = true;
      access.set(w.label, a);
    });
    access.forEach((a, label) => {
      if (!sources.has(label)) sources.set(label, id('ds_', label));
      const verb = a.read && a.write ? 'liest + schreibt' : a.write ? 'schreibt' : 'liest';
      edges.push(`  ${epId} -->|"${verb}"| ${sources.get(label)}`);
    });

    ep.outputs.forEach((o) => {
      if (!outputs.has(o.label)) outputs.set(o.label, id('out_', o.label));
      edges.push(`  ${epId} -->|"erstellt"| ${outputs.get(o.label)}`);
    });
  });

  // Subgraph: Ausloeser
  lines.push('  subgraph TRIG["Auslöser"]');
  lines.push('    direction TB');
  triggers.forEach((nodeId, label) => lines.push(`    ${nodeId}["${label}"]:::trigger`));
  lines.push('  end');

  // Subgraph: Server / Endpoints
  lines.push(`  subgraph SVC["${model.service.name}"]`);
  lines.push('    direction TB');
  model.endpoints.forEach((ep, i) => {
    lines.push(`    ep${i}["<b>${ep.method} ${ep.path}</b><br/>${ep.title}"]:::endpoint`);
  });
  lines.push('  end');

  // Subgraph: Daten & Ausgaben
  lines.push('  subgraph DATA["Daten & Ausgaben"]');
  lines.push('    direction TB');
  sources.forEach((nodeId, label) => lines.push(`    ${nodeId}[("${label}")]:::datasource`));
  outputs.forEach((nodeId, label) => lines.push(`    ${nodeId}["📄 ${label}"]:::output`));
  lines.push('  end');

  return [
    'flowchart LR',
    ...lines,
    ...edges,
    'classDef trigger fill:#10243a,stroke:#3ba9ff,stroke-width:1.5px,color:#c2e4ff;',
    'classDef endpoint fill:#2a2110,stroke:#ffae3b,stroke-width:1.5px,color:#ffe0ad;',
    'classDef datasource fill:#0d2614,stroke:#00B520,stroke-width:1.5px,color:#bff5c6;',
    'classDef output fill:#231a33,stroke:#b07bff,stroke-width:1.5px,color:#e0d0ff;',
    'style TRIG fill:transparent,stroke:#2a2f2a,color:#9aa49a;',
    'style SVC fill:transparent,stroke:#2a2f2a,color:#9aa49a;',
    'style DATA fill:transparent,stroke:#2a2f2a,color:#9aa49a;',
  ].join('\n');
}

export default function Diagram({ model }: { model: Model }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import(/* webpackIgnore: true */ MERMAID_CDN)).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          securityLevel: 'strict',
          flowchart: { curve: 'basis', htmlLabels: true, nodeSpacing: 45, rankSpacing: 70 },
          themeVariables: {
            fontFamily: 'Montserrat, system-ui, sans-serif',
            fontSize: '14px',
            lineColor: '#6a726a',
            edgeLabelBackground: '#0a0c0a',
          },
        });
        const def = buildMermaid(model);
        const { svg } = await mermaid.render('fl-arch-graph', def);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [model]);

  if (error) {
    return (
      <div className="diagram-fallback">
        Diagramm konnte nicht geladen werden ({error}). Die Endpoint-Details unten sind davon
        unabhängig.
      </div>
    );
  }

  return <div ref={ref} className="diagram" aria-label="Architektur-Diagramm" />;
}
