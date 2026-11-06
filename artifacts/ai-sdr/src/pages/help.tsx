import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen, Search, X } from "lucide-react";
import { Layout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { guideAnchor, parseGuide, searchGuide } from "@/lib/training-guide";
import guide from "../../../../docs/training/isdrxai-user-guide.md?raw";

const sections = parseGuide(guide);

function Inline({ text, navigate }: { text: string; navigate: (id: string) => void }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(#[^)]+\))/g);
  return <>{parts.map((part, index) => {
    if (part.startsWith("**")) return <strong key={index} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <code key={index} className="rounded bg-muted px-1 py-0.5 text-xs break-words">{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\(#([^)]+)\)$/.exec(part);
    if (link) return <a key={index} href={`#${link[2]}`} className="text-primary underline underline-offset-4" onClick={event => { event.preventDefault(); navigate(link[2]); }}>{link[1]}</a>;
    return <Fragment key={index}>{part}</Fragment>;
  })}</>;
}

/** Render the guide's headings, tables, lists, and code as safe React elements. */
function GuideBody({ content, navigate }: { content: string; navigate: (id: string) => void }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  const inline = (text: string) => <Inline text={text} navigate={navigate} />;
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const key = index;
    if (!line.trim()) { index++; continue; }
    if (line.startsWith("```")) {
      const code: string[] = [];
      index++;
      while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++]);
      index++;
      blocks.push(<pre key={key} className="max-w-full overflow-x-auto rounded-lg border bg-muted/50 p-4 text-xs leading-relaxed"><code>{code.join("\n")}</code></pre>);
    } else if (/^### /.test(line)) {
      blocks.push(<h3 key={key} id={guideAnchor(line.slice(4))} className="pt-4 text-base font-semibold text-foreground">{inline(line.slice(4))}</h3>);
      index++;
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (index < lines.length && lines[index].startsWith("|")) {
        const row = lines[index++].replace(/^\|\s*|\s*\|$/g, "").split("|").map(cell => cell.trim());
        if (!row.every(cell => /^:?-+:?$/.test(cell))) rows.push(row);
      }
      blocks.push(<div key={key} className="max-w-full overflow-x-auto rounded-lg border" role="region" aria-label="Guide reference table" tabIndex={0}>
        <table className="w-full text-left text-sm"><thead className="bg-muted/60"><tr>{rows[0]?.map((cell, i) => <th key={i} scope="col" className="min-w-36 px-4 py-3 font-semibold text-foreground">{inline(cell)}</th>)}</tr></thead>
          <tbody>{rows.slice(1).map((row, r) => <tr key={r} className="border-t">{row.map((cell, c) => <td key={c} className="px-4 py-3 align-top leading-relaxed">{inline(cell)}</td>)}</tr>)}</tbody>
        </table>
      </div>);
    } else if (/^(?:\d+\. |- )/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const pattern = ordered ? /^\d+\. / : /^- /;
      const items: string[] = [];
      while (index < lines.length && pattern.test(lines[index])) items.push(lines[index++].replace(pattern, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={key} className={`${ordered ? "list-decimal" : "list-disc"} space-y-2 pl-6 marker:text-primary`}>{items.map((item, i) => <li key={i} className="pl-1 leading-relaxed">{inline(item)}</li>)}</List>);
    } else {
      const paragraph = [lines[index++]];
      while (index < lines.length && lines[index].trim() && !/^(?:### |\||```|\d+\. |- )/.test(lines[index])) paragraph.push(lines[index++]);
      blocks.push(<p key={key} className="leading-relaxed">{inline(paragraph.join(" "))}</p>);
    }
  }
  return <div className="space-y-4 text-sm text-muted-foreground break-words">{blocks}</div>;
}

export function HelpTrainingContent() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => searchGuide(sections, query), [query]);
  const navigate = (id: string) => {
    setQuery("");
    window.history.replaceState(null, "", `#${id}`);
    requestAnimationFrame(() => {
      const target = document.getElementById(id);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      target?.focus({ preventScroll: true });
    });
  };
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
  }, []);

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="rounded-xl border bg-card p-5 sm:p-7">
      <div className="mb-3 flex items-center gap-3"><BookOpen className="h-6 w-6 text-primary" /><h1 className="text-2xl font-bold tracking-tight">Help &amp; Training</h1></div>
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Learn each part of iSDRX AI, from your first prospect search to campaigns, gifts, calls, and follow-up.</p>
      <div className="relative mt-5 max-w-2xl">
        <label htmlFor="training-search" className="sr-only">Search the training guide</label>
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input id="training-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search topics, buttons, or questions…" className="pl-9 pr-11" />
        {query && <Button variant="ghost" size="icon" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-1 top-1 h-8 w-8"><X className="h-4 w-4" /></Button>}
      </div>
      <p role="status" className="mt-2 text-xs text-muted-foreground">{query.trim() ? `${filtered.length} matching section${filtered.length === 1 ? "" : "s"}` : "Choose a section below or search the full guide."}</p>
    </header>
    <div className="grid min-w-0 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label="Training sections" className="self-start rounded-xl border bg-card p-4 lg:sticky lg:top-6 lg:max-h-[80vh] lg:overflow-y-auto">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">On this page</h2>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">{filtered.map(section => <a key={section.id} href={`#${section.id}`} onClick={event => { event.preventDefault(); navigate(section.id); }} className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{section.title}</a>)}</div>
      </nav>
      <div className="min-w-0 space-y-5">
        {!filtered.length && <div className="rounded-xl border bg-card p-8 text-center"><h2 className="text-lg font-semibold">No matching sections</h2><p className="mt-2 text-sm text-muted-foreground">Try a shorter phrase such as “gift,” “fit scores,” or “calls.”</p><Button variant="outline" className="mt-4" onClick={() => setQuery("")}>Show all topics</Button></div>}
        {filtered.map(section => <section key={section.id} id={section.id} tabIndex={-1} className="min-w-0 scroll-mt-6 rounded-xl border bg-card p-5 focus:outline-none sm:p-7" aria-labelledby={`${section.id}-title`}>
          <h2 id={`${section.id}-title`} className="mb-5 text-xl font-semibold tracking-tight">{section.title}</h2>
          <GuideBody content={section.content} navigate={navigate} />
        </section>)}
      </div>
    </div>
  </div>;
}

export default function HelpTraining() {
  return <Layout><HelpTrainingContent /></Layout>;
}
