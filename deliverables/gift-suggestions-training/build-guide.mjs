import fs from "node:fs";
import path from "node:path";

const dir = path.dirname(new URL(import.meta.url).pathname);
const scenes = [
  {
    file: "01-prospect-search-gift-suggestions.png",
    title: "Find Gift Suggestions",
    duration: "About 25 seconds",
    steps: ["Open Prospect Search and click Generate Leads.", "On a result card, click Gift Suggestions—not Add—to explore ideas without saving the prospect."],
    markers: [[23, 44.5, "1"], [92, 69.4, "2"]],
    narration: "Start on Prospect Search and generate your leads. When the results appear, click Gift Suggestions on the prospect you want to research. You can explore ideas before adding the prospect to your pipeline. Opening this window does not save the prospect, start outreach, or purchase anything.",
    note: "The screenshots use fictional people, companies, and sample responses in the actual app interface."
  },
  {
    file: "02-unsaved-preview-budget-25.png",
    title: "Set a budget and generate ideas",
    duration: "About 25 seconds",
    steps: ["Enter a whole-dollar budget from $10 to $100.", "Click Generate ideas and wait for research to finish."],
    markers: [[66.7, 51.8, "1"], [75.4, 51.8, "2"]],
    narration: "Set your budget between ten and one hundred dollars, then click Generate ideas. The app will research publicly available information and prepare gift suggestions. This is an unsaved preview: the ideas are not retained when you close the window. If you want to keep working with this prospect, add them to your pipeline separately.",
    note: "Gift prices are estimates. Shipping, taxes, and customization may increase the final cost."
  },
  {
    file: "03-preview-generated-ideas-research-links.png",
    title: "Review the research and gift ideas",
    duration: "About 45 seconds",
    steps: ["Read the Research summary and any supporting source links.", "Review why each idea fits. A name-only gift is not evidence of a hobby or affiliation.", "Use the Amazon, Target, or Etsy search links to browse options."],
    markers: [[21, 28.6, "1"], [21, 50, "2"], [43, 58.5, "3"]],
    narration: "Read the research summary before choosing a gift. Google-backed research is tried first, with an alternate public-web search when needed. Public sources may include LinkedIn or Facebook pages, company biographies, Chamber of Commerce profiles, blogs, and award pages. Private profiles are not accessed. When facts are confirmed, ideas can reflect a college, degree, hobby, or fraternity or sorority. In this sample, no personal facts were verified, so the ideas use the supplied name only. Retailer links open searches, not verified product listings.",
    note: "The sample research and suggestions are illustrative—not live research, endorsements, or purchase offers."
  },
  {
    file: "04-saved-ideas-compare-prices.png",
    title: "Compare prices for a saved prospect",
    duration: "About 25 seconds",
    steps: ["Use Add on the search result when you decide to save the prospect.", "Reopen Gift Suggestions and generate saved ideas as needed.", "Click Compare prices for the gift you want to investigate."],
    markers: [],
    narration: "When you decide to save the prospect, close the preview and use Add on their search result. Reopen Gift Suggestions and generate saved ideas as needed. Saved prospects have a Compare prices option. Use it to check merchant offers for a particular gift. The original gift outreach location remains available too.",
    note: "The unsaved preview is not automatically carried into the saved prospect. This screenshot shows saved sample ideas."
  },
  {
    file: "05-saved-compare-unknown-shipping.png",
    title: "Check the full cost before buying",
    duration: "About 35 seconds",
    steps: ["Review the listed item price, availability, and shipping status.", "Unknown shipping is not free shipping. Taxes are excluded.", "Confirm customization, employer gift policy, and the final checkout total."],
    markers: [],
    narration: "Review the merchant result carefully. This example shows a listed item price of twenty-one dollars and ninety-nine cents, but shipping is unknown. That does not establish the lowest delivered cost. When shipping is confirmed, the app can compare item-and-shipping totals among checked offers. Always confirm price, availability, personalization, and taxes on the merchant's website. Choosing a gift does not purchase it, approve outreach, or mark it as sent. Check the recipient's employer gift policy before buying.",
    note: "Sample Retailer and its price are training fixtures, not a real listing. No purchase is made by opening these links."
  },
];
const esc = s => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const sections = scenes.map((s, i) => {
  const data = fs.readFileSync(path.join(dir, "screenshots", s.file)).toString("base64");
  return `<section class="scene">
    <header><span>iSDRX AI • GIFT SUGGESTIONS</span><span>SCENE ${i + 1} / ${scenes.length} · ${s.duration}</span></header>
    <h1>${i + 1}. ${esc(s.title)}</h1>
    <div class="body"><div class="screen"><img alt="${esc(s.title)} — actual interface with fictional training data" src="data:image/png;base64,${data}">${s.markers.map(([x,y,n]) => `<b class="marker" style="left:${x}%;top:${y}%">${n}</b>`).join("")}</div>
    <aside><h2>What to do</h2><ol>${s.steps.map(t => `<li>${esc(t)}</li>`).join("")}</ol><p class="note">${esc(s.note)}</p></aside></div>
    <div class="voice"><h2>HeyGen narration</h2><p>${esc(s.narration)}</p></div>
    <footer>Actual app screenshots • Fictional sample data • September 19, 2026 • No private profiles or live purchases</footer>
  </section>`;
}).join("\n");
fs.writeFileSync(path.join(dir, "gift-suggestions-how-to.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>iSDRX AI — Gift Suggestions Screenshot Guide</title><style>
*{box-sizing:border-box}body{margin:0;background:#e8edf3;color:#112b45;font-family:Arial,Helvetica,sans-serif}.intro{max-width:1320px;margin:25px auto;padding:18px 28px;background:white;border-radius:12px;font-size:16px;line-height:1.6}.scene{width:1320px;max-width:100%;margin:24px auto;background:white;padding:28px 32px;break-after:page}header{display:flex;justify-content:space-between;font-size:12px;font-weight:bold;letter-spacing:1px;color:#45647d}h1{font-size:32px;margin:17px 0 20px}h2{font-size:16px;margin:0 0 12px}.body{display:grid;grid-template-columns:960px 1fr;gap:22px;align-items:start}.screen{position:relative;width:100%;border:1px solid #cfdae5;overflow:hidden;border-radius:8px}.screen img{width:100%;display:block}.marker{position:absolute;transform:translate(-50%,-50%);border-radius:50%;display:grid;place-items:center;width:28px;height:28px;background:#153d64;color:white;border:3px solid white;box-shadow:0 0 0 2px #153d64;font-size:15px}aside{background:#f1f5f9;border-radius:8px;padding:18px 15px;font-size:15px;line-height:1.55}ol{padding-left:21px;margin:0}li{padding-left:3px;margin:0 0 15px}.note{border-top:1px solid #c8d6e3;padding-top:13px;font-size:12px;line-height:1.55}.voice{margin-top:18px;padding:16px 20px;border-left:4px solid #234e76;background:#f1f5f9}.voice p{font-size:16px;line-height:1.55;margin:0}.voice h2{text-transform:uppercase;letter-spacing:1px;font-size:12px;margin-bottom:8px}footer{font-size:10px;color:#627588;margin-top:16px}.scene:last-child{break-after:auto}@page{size:16in 11in;margin:0.25in}@media print{body{background:white}.intro{display:none}.scene{width:100%;margin:0;padding:15px;break-inside:avoid}.body{grid-template-columns:74% 1fr}h1{font-size:28px}.voice p{font-size:15px}.screen{border-radius:0}footer{margin-top:12px}}@media screen and (max-width:1000px){.body{grid-template-columns:1fr}.scene{padding:20px}h1{font-size:26px}}
</style></head><body><div class="intro"><strong>Gift Suggestions: screenshot-based how-to</strong><br>Five scenes, approximately 2½–3 minutes. For HeyGen, upload each numbered screenshot as a scene background and paste the matching narration. Keep the sample-data label visible. Use a small avatar inset that does not cover the controls. Only narration is spoken; instructions and notes are editing guidance. The PDF provides the same screenshots and narration in a printable guide.</div>${sections}</body></html>`);
fs.writeFileSync(path.join(dir,"heygen-narration.txt"), `iSDRX AI — Gift Suggestions\nScreenshot-based HeyGen training script\nApproximately 2½–3 minutes\n\nSETUP: Use the numbered PNG files as scene backgrounds. Paste only the NARRATION for each scene into HeyGen. Screenshots show the real interface with fictional sample data, not live research or offers. Keep the sample-data banner visible. A small avatar inset should not cover controls. No video has been rendered or uploaded to HeyGen.\n\n` + scenes.map((s,i)=>`SCENE ${i+1}: ${s.title}\nIMAGE: screenshots/${s.file}\nDURATION: ${s.duration}\n\nNARRATION:\n${s.narration}\n\nON-SCREEN ACTIONS:\n${s.steps.map((t,j)=>`${j+1}. ${t}`).join("\n")}\n\nEDITOR NOTE: ${s.note}\n`).join("\n----------------------------------------\n\n"));
console.log("Created self-contained screenshot guide and HeyGen narration.");