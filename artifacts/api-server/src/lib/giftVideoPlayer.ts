import { randomBytes } from "node:crypto";
import type { GiftVideo } from "@workspace/db";
import { escapeHtml } from "./giftVideoOutreach";
import sharp from "sharp";
import { createPlaybackReporter } from "./giftVideoReporter";

export async function giftVideoPoster(video: GiftVideo, thumbnail?: Buffer): Promise<Buffer> {
  const title = escapeHtml(video.title.slice(0, 64));
  const name = video.showNameOnThumbnail ? escapeHtml(video.prospectName.slice(0, 48)) : "";
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="630" viewBox="0 0 1120 630" role="img" aria-label="Play ${title}">
<defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#14243e"/><stop offset="1" stop-color="#22655f"/></linearGradient></defs>
${thumbnail ? '<rect width="1120" height="630" fill="#001322" opacity=".45"/>' : '<rect width="1120" height="630" rx="24" fill="url(#g)"/>'}
<circle cx="560" cy="275" r="66" fill="white" opacity=".97"/><path d="M545 244 L545 306 L591 275 Z" fill="#1b5454"/>
<text x="560" y="425" text-anchor="middle" font-family="Arial,sans-serif" font-size="32" fill="white">${name ? `A personal message for ${name}` : "A personal message for you"}</text>
<text x="560" y="481" text-anchor="middle" font-family="Arial,sans-serif" font-size="25" fill="#e3eeee">${title}</text>
<text x="560" y="557" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" fill="#d1e8e1">WATCH YOUR VIDEO</text></svg>`;
  if (!thumbnail) return sharp(Buffer.from(overlay)).png().toBuffer();
  // Decode and bound custom images before compositing. No external resource or
  // SVG-image fetch is needed by the mail client; the final bytes are plain PNG.
  const background = await sharp(thumbnail, { limitInputPixels: 40_000_000 })
    .rotate().resize(1120, 630, { fit: "cover" }).png().toBuffer();
  return sharp(background).composite([{ input: Buffer.from(overlay) }]).png().toBuffer();
}

export function renderGiftVideoPlayer(video: GiftVideo, sessionId: string) {
  const nonce = randomBytes(18).toString("base64");
  const base = `/api/gift-videos/watch/${video.token}`;
  const config = JSON.stringify({ base, sessionId }).replace(/</g, "\\u003c");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><title>${escapeHtml(video.title)}</title>
<style nonce="${nonce}">
*{box-sizing:border-box}body{margin:0;background:#f3f6f5;color:#152b35;font:16px/1.65 system-ui,-apple-system,sans-serif}
main{max-width:850px;margin:48px auto;padding:36px;background:white;border:1px solid #dfe7e5;border-radius:22px;box-shadow:0 12px 40px #16312b09}
.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:11px;color:#56736b;font-weight:700}h1{font-size:clamp(25px,5vw,39px);line-height:1.2;letter-spacing:-.03em;margin:10px 0 12px}
.intro,.transcript{white-space:pre-wrap}video{width:100%;max-height:65vh;background:#132a34;border-radius:12px;display:block;margin:24px 0}
.button{display:inline-block;background:#245e50;color:white;padding:13px 21px;border-radius:8px;text-decoration:none;font-weight:600}
.privacy{color:#71817e;font-size:12px;margin-top:28px;border-top:1px solid #e5ebea;padding-top:16px}details{margin-top:25px}
#error{color:#9d3028;font-size:14px}.gift{color:#5d726a;font-size:14px}@media(max-width:650px){main{margin:0;padding:25px 18px;border:0;border-radius:0;min-height:100vh}}
</style></head><body><main><div class="eyebrow">A personal message</div>
<h1>${escapeHtml(video.title)}</h1><p>Hi ${escapeHtml(video.prospectName)},</p>
<p class="gift">About the ${escapeHtml(video.giftName)} sent on ${escapeHtml(video.giftSentDate)} — did it reach you safely?</p>
${video.introduction ? `<p class="intro">${escapeHtml(video.introduction)}</p>` : ""}
<video id="player" controls playsinline preload="metadata" poster="${base}/poster" controlslist="nodownload" aria-label="${escapeHtml(video.title)}">
<source src="${base}/media" type="video/mp4">Your browser does not support MP4 playback. Please contact the sender.</video>
<p id="error" role="status"></p><p>${escapeHtml(video.cta)}</p>
<a class="button" href="${base}/schedule" rel="noreferrer">Schedule a quick conversation →</a>
${video.transcript ? `<details><summary>Read the transcript</summary><div class="transcript">${escapeHtml(video.transcript)}</div></details>` : ""}
<p class="privacy">This private link reports anonymous visits and estimated playback to the sender. Link activity does not verify who watched. Please do not forward the link.</p>
</main><script nonce="${nonce}">
const config=${config}, video=document.getElementById("player"), error=document.getElementById("error");
let stopped=false,lastSent=0;
const reporter=(${createPlaybackReporter.toString()})({
 now:()=>Date.now(),schedule:(callback,delay)=>setTimeout(callback,delay),
 send:async(sample)=>{
  try {
   const response=await fetch(config.base+"/progress",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:config.sessionId,...sample})});
   if(response.status===410||response.status===404){stopped=true;video.pause();error.textContent="This video link or playback session has expired. Please reload or contact the sender.";return {accepted:false,stop:true}}
   if(!response.ok){if(response.status===429||response.status>=500)throw new Error("Reporting unavailable");return {accepted:false,stop:true}}
   const result=await response.json();
   return {accepted:result.watchPercentage!==null,retryAfterMs:result.retryAfterMs};
  }catch(err){error.textContent="Playback reporting is temporarily unavailable. You can continue watching.";throw err}
 }
});
function report(force=false, seeking=false, ended=false){
 if(stopped||(!force&&Date.now()-lastSent<1800))return;
 lastSent=Date.now();
 const ranges=[];for(let i=0;i<video.played.length;i++)ranges.push([video.played.start(i),video.played.end(i)]);
 reporter.report({
   position:video.currentTime,playing:(!video.paused||ended)&&!document.hidden&&video.playbackRate<=1.25,
   seeking:seeking||video.seeking,ranges
 },ended);
}
video.addEventListener("playing",()=>report(true));video.addEventListener("seeking",()=>report(true,true));
video.addEventListener("seeked",()=>report(true,true));video.addEventListener("ended",()=>report(true,false,true));
video.addEventListener("error",()=>{error.textContent="The video could not be loaded. Please contact the sender for a new link."});
document.addEventListener("visibilitychange",()=>report(true,true));
setInterval(()=>{if(!video.paused&&!video.ended)report()},2000);
</script></body></html>`;
  return {
    html,
    csp: `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self'; media-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  };
}