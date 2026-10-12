"use strict";
const DETAIL_FIELDS=['label','releaseDate','releaseYear','genre','bpm','keyName','camelot'];
function trackDetails(entry){
 if(!entry)return null;
 const details=Object.fromEntries(DETAIL_FIELDS.map(field=>[field,entry[field]]).filter(([,value])=>value!==null&&value!==undefined&&value!==''&&value!==0));
 return Object.keys(details).length?details:null;
}
function createLyrionTrackMetadata(enrichment,clock=Date.now,catalogue=null){
 const cache=new Map(),pending=new Map();
 return async input=>{
  const track={title:String(input?.title||'').trim().slice(0,300),artist:String(input?.artist||'').trim().slice(0,300),album:String(input?.album||'').trim().slice(0,300)};
  const durationMs=Math.round(Number(input?.durationMs)||0);if(durationMs>0)track.durationMs=durationMs;
  if(!track.title||!track.artist)return {metadata:null,reason:'Track title and artist are needed.'};
  // A verified catalogue identity may arrive after the initial radio lookup.
  // Give it a fresh cache scope so an earlier miss cannot hide that enrichment.
  // The supplied ID is only a cache discriminator; catalogue.lookup still
  // verifies title/version and credited artists before returning metadata.
  const suppliedId=String(input?.tidal?.id||'');
  const tidalId=/^\d{1,20}$/.test(suppliedId)?suppliedId:'';
  const key=JSON.stringify([track.title,track.artist,track.album,tidalId]),cached=cache.get(key);
  if(cached&&clock()-cached.at<(cached.value.metadata||cached.value.details?600000:60000))return cached.value;
  if(pending.has(key))return pending.get(key);
  const work=(async()=>{
   let entry=await enrichment.lookupBeatport(track,{retryMissingAfterMs:60000});
   let match=null;
   if((!entry?.beatport||Number(entry.confidence)<95)&&catalogue){match=await catalogue.lookup(track);if(match)entry=await enrichment.lookupBeatport({...track,title:match.title,artist:match.artist,isrc:match.isrc},{retryMissingAfterMs:60000});}
   const value=entry?.beatport&&Number(entry.confidence)>=95?{metadata:entry.beatport}:{metadata:null,reason:'No confident Beatport match for this track.'};
   if(match)value.catalogue={tidal:match};
   value.beatportEnabled=enrichment.beatport?.isConfigured?.()===true;
   value.details=typeof enrichment.enrich==='function'?trackDetails(await enrichment.enrich(track).catch(()=>null)):null;
   cache.set(key,{at:clock(),value});if(cache.size>200)cache.delete(cache.keys().next().value);return value;
  })().finally(()=>pending.delete(key));pending.set(key,work);return work;
 };
}
module.exports={createLyrionTrackMetadata};
