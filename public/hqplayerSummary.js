"use strict";
function hqplayerRows(h){
  if(!h||!h.rate)return [];
  const dsd=/dsd|sdm/i.test(h.mode||""),rows=[];
  const rate=h.rate>=1e6?`${+(h.rate/1e6).toFixed(4)} MHz`:`${+(h.rate/1000).toFixed(1)} kHz`;
  const multiple=h.rate%44100===0?h.rate/44100:h.rate%48000===0?h.rate/48000:0;
  const depth=h.bits?` / ${h.bits}-bit${dsd?" SDM":""}`:"";
  rows.push(["HQPlayer output",`${dsd?(multiple?`DSD${multiple}`:"DSD"):(h.mode||"PCM")} · ${rate}${depth}`]);
  if(h.filter)rows.push(["Filter",h.filter]);
  if(h.shaper)rows.push(["Shaper",h.shaper]);
  if(h.speed>0&&!h.host)rows.push(["Speed",`${+h.speed.toFixed(1)}x realtime`]);
  return rows;
}
function hqplayerSummary(h){
  return hqplayerRows(h).map(([,value])=>value).join(" · ");
}
function hqpHostParts(h){
  if(!h||!h.host)return null;
  const parts=[],n=v=>typeof v==="number"&&Number.isFinite(v);
  if(h.state===2&&n(h.speed)&&h.speed>0)parts.push({text:`${h.speed.toFixed(2)}x realtime`,level:h.speed<1?"bad":h.speed<1.1?"warn":"ok"});
  const g=h.host.available?h.host.gpu:null;
  if(!h.host.available)parts.push({text:"HQP host: no data",level:"muted"});
  if(g&&n(g.temperatureC))parts.push({text:`GPU ${Math.round(g.temperatureC)}°C`,level:g.temperatureC>=90?"bad":g.temperatureC>=80?"warn":"ok"});
  if(g&&n(g.usagePercent))parts.push({text:`${Math.round(g.usagePercent)}%`});
  if(g&&n(g.powerW))parts.push({text:`${Math.round(g.powerW)} W`});
  if(g&&n(g.memoryUsedMiB)&&n(g.memoryTotalMiB))parts.push({text:`${(g.memoryUsedMiB/1024).toFixed(1)} / ${Math.round(g.memoryTotalMiB/1024)} GB`});
  if(n(h.clips))parts.push({text:`${h.clips} clip${h.clips===1?"":"s"}`,level:h.clips>0?"bad":"ok"});
  return parts;
}
function renderHqpHost(signal,h){
  let line=signal.nextElementSibling;
  if(!line||line.className!=="hqpHostLine"){line=document.createElement("p");line.className="hqpHostLine";signal.after(line);}
  const parts=hqpHostParts(h);
  if(!parts||!parts.length){line.replaceChildren();line.hidden=true;return;}
  const tag=document.createElement("span");tag.className="hqpHostTag";tag.textContent="HQP host";
  const nodes=[tag];
  parts.forEach((part,index)=>{
    if(index)nodes.push(" · ");
    const span=document.createElement("span");span.textContent=part.text;
    if(part.level)span.dataset.level=part.level;
    nodes.push(span);
  });
  line.replaceChildren(...nodes);line.hidden=false;
}
