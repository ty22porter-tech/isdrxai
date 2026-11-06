export type GuideSection = { id: string; title: string; content: string };
export const guideAnchor = (title: string) => title.toLowerCase().replace(/[^\w -]/g, "").replace(/ /g, "-");

/** The checked-in training guide is the single source for in-app help. */
export function parseGuide(markdown: string): GuideSection[] {
  const sections: GuideSection[] = [];
  for (const part of markdown.replace(/^# .+\n/, "").split(/^## /m)) {
    if (!part.trim()) continue;
    const newline = part.indexOf("\n");
    const introduction = sections.length === 0;
    const title = introduction ? "Welcome to iSDRX AI" : part.slice(0, newline).trim();
    const content = introduction ? part.trim() : part.slice(newline + 1).trim();
    sections.push({ id: introduction ? "welcome" : guideAnchor(title), title, content });
  }
  return sections;
}

export function searchGuide(sections: GuideSection[], query: string): GuideSection[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return sections.filter(section => terms.every(term => `${section.title} ${section.content}`.toLowerCase().includes(term)));
}
