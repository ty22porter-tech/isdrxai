import fs from "node:fs";
import path from "node:path";
const dir = path.dirname(new URL(import.meta.url).pathname);
const md = fs.readFileSync(path.join(dir, "heygen-video-script.md"), "utf8");
const chunks = md.split(/(?=^## )/m);
const scenes = chunks.filter(s => s.startsWith("## Scene"));
const narration = scenes.map(s => {
  const title = s.split("\n")[0].replace("## ", "");
  const text = s.split("NARRATION:\n")[1].split("\n\nSCENE PROMPT:")[0];
  return `${title}\n\n${text}`;
}).join("\n\n----------------------------------------\n\n");
const words = scenes.map(s => s.split("NARRATION:\n")[1].split("\n\nSCENE PROMPT:")[0]).join(" ").split(/\s+/).length;
fs.writeFileSync(path.join(dir,"narration-only.txt"), "HOW TO USE iSDRX AI — HEYGEN NARRATION\nPaste one scene at a time; do not read scene titles aloud.\n\n" + narration);
fs.writeFileSync(path.join(dir,"heygen-prompts.txt"), chunks.find(s=>s.startsWith("## Copy-ready")).replace(/^## /,"") + "\n\n" + scenes.map(s => {
  return s.split("\n")[0].replace("## ","")+"\n\n"+s.split("SCENE PROMPT:\n")[1];
}).join("\n\n----------------------------------------\n\n"));
const esc = s => s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const html = chunks.map((chunk,i) => `<section class="${chunk.startsWith("## Scene") ? "scene" : "reference"}">`+chunk.trim().split(/\n\n/).map(block => {
  if(block.startsWith("# ")) return `<h1>${esc(block.slice(2))}</h1>`;
  if(block.startsWith("## ")) {
    const [title,...rest]=block.slice(3).split("\n");
    return `<h2>${esc(title)}</h2>${rest.length?`<p class="timing">${esc(rest.join(" "))}</p>`:""}`;
  }
  const labeled = block.match(/^(NARRATION|SCENE PROMPT|SCREEN ACTIONS|ON-SCREEN TEXT):\n([\s\S]*)$/);
  if(labeled) return `<div class="block ${labeled[1]==="NARRATION"?"narration":""}"><h3>${esc(labeled[1])}</h3><p>${esc(labeled[2]).replaceAll("\n","<br>")}</p></div>`;
  return `<p>${esc(block).replaceAll("\n","<br>")}</p>`;
}).join("\n")+"</section>").join("\n");
fs.writeFileSync(path.join(dir,"heygen-video-guide.html"),`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>How to Use iSDRX AI — HeyGen Video Guide</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;color:#172f48;background:#edf1f6;font:16px/1.6 Arial,Helvetica,sans-serif}main{max-width:900px;margin:auto}section{padding:40px 50px;background:white;margin:24px 0;border-top:5px solid #193f65}h1{font-size:38px;line-height:1.2;margin:0}h2{font-size:27px;line-height:1.25;margin:0 0 16px}h3{font-size:11px;letter-spacing:1.4px;color:#456480;margin:0 0 10px}p{margin:0 0 18px}.block{margin:22px 0}.narration{padding:20px;background:#f0f5fa;border-left:4px solid #234e76}.timing{font-size:13px;color:#536b81}.masthead{font-size:12px;letter-spacing:2px;color:#456480;padding:24px 0 0}@page{size:letter;margin:0.55in}@media print{body{background:white;font-size:11px;line-height:1.55}.masthead{padding:0 0 12px}section{padding:22px 6px 10px;margin:0;break-before:page;border-top-width:3px}section:first-of-type{break-before:auto}h1{font-size:30px}h2{font-size:23px}.block{margin:18px 0}.narration{padding:14px}h3{font-size:10px}.block{break-inside:avoid}p{margin-bottom:15px}.timing{font-size:11px}}@media(max-width:650px){section{padding:25px}}
</style></head><body><main><div class="masthead">iSDRX AI / CUSTOMER EDUCATION</div>${html}</main></body></html>`);
console.log(JSON.stringify({scenes:scenes.length,narrationWords:words,minutesAt135WPM:(words/135).toFixed(1)}));