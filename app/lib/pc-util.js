/* Phase C extraction (docs/stabilization-plan.md) — pure helpers moved verbatim out of
   app/index.html's inline script. No DOM, no Supabase, no `this`. Dual-environment so the
   same file runs in the browser (classic <script>, no build step) and in Node's test
   runner with zero dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node tests
  else root.PCUtil = api;                                                    // browser
})(this, function () {

  function uid(){return crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});}
  function isHeic(f){const t=(f.type||'').toLowerCase(),n=(f.name||'').toLowerCase();return t.includes('heic')||t.includes('heif')||n.endsWith('.heic')||n.endsWith('.heif');}
  const thumbOf=path=>path.replace(/\.jpg$/,'_thumb.jpg');
  // today's date in the user's OWN timezone (toISOString() uses UTC and rolls a day early in the Americas)
  function todayLocal(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
  function sameSet(a,b){ if(a.length!==b.length)return false; const s=new Set(a.map(String)); return b.every(x=>s.has(String(x))); }

  /* ---- name auto-detection from filename + photo metadata (ported from the catalog app) ---- */
  function escapeRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
  function collectStrings(o,depth,out){
    out=out||[];depth=depth||0;
    if(o==null||depth>4)return out;
    if(typeof o==="string"){if(o.length<300)out.push(o);return out;}
    if(Array.isArray(o)){o.forEach(v=>collectStrings(v,depth+1,out));return out;}
    if(typeof o==="object"){for(const k in o)collectStrings(o[k],depth+1,out);return out;}
    return out;
  }
  // Pull the species epithet + any variety/subspecies/forma/cultivar/hybrid that follows.
  function extractEpithet(after,genusList){
    after=after.replace(/^[\s:;,._\-]+/,"");
    let hybrid="";
    const hm=after.match(/^(×|x)\s+/i);
    if(hm){hybrid="× ";after=after.slice(hm[0].length);}
    let cv=after.match(/^['‘’"“”]([^'‘’"“”]{2,40})['‘’"“”]/);
    if(cv) return (hybrid+"'"+cv[1].trim()+"'").trim();
    const genSet=new Set(genusList.map(x=>x.toLowerCase()));
    const spMatch=after.match(/^(spp?)\.\s+([A-Za-z][A-Za-z\-]*)/i);
    if(spMatch) return hybrid+"sp. "+spMatch[2];
    const m=after.match(/^([A-Za-z][A-Za-z\-]{2,})/);
    if(!m) return hybrid.trim();
    const word=m[1].toLowerCase();
    if(genSet.has(word)||STOP.has(word)) return hybrid.trim();
    const parts=[hybrid+word];
    after=after.slice(m[0].length);
    for(let i=0;i<2;i++){ // var. / subsp. / f. + epithet
      const r=after.match(/^\s+([A-Za-z]+)\.?\s+([A-Za-z][A-Za-z\-]+)/);
      if(r&&RANK.test(r[1])){parts.push(r[1].toLowerCase().replace(/\.?$/,".")+" "+r[2].toLowerCase());after=after.slice(r[0].length);}
      else break;
    }
    const hx=after.match(/^\s+(×|x)\s+([A-Za-z][A-Za-z\-]{2,})/i); // hybrid cross
    if(hx){parts.push("× "+hx[2].toLowerCase());after=after.slice(hx[0].length);}
    cv=after.match(/^\s+['‘’"“”]([^'‘’"“”]{2,40})['‘’"“”]/); // trailing cultivar
    if(cv) parts.push("'"+cv[1].trim()+"'");
    return parts.join(" ").trim();
  }
  function matchGenusSpeciesFromString(raw,genusList){
    const t=" "+raw.replace(/\s+/g," ").trim()+" ";
    for(const g of genusList){
      const m=new RegExp("\\b"+escapeRe(g)+"\\b","i").exec(t);
      if(!m) continue;
      let after=t.slice(m.index+m[0].length).replace(/^\s+/,"");
      if(!after) return {genus:g,species:""};
      const cvM=after.match(/^(['‘’"“”])(.*?)\1\s*(.*)/s); // cultivar in quotes; rest → notes
      if(cvM){return {genus:g,species:"'"+cvM[2].trim()+"'",notes:cvM[3].trim()};}
      if(/\s[Xx×]\s/.test(" "+after)){ // hybrid — grab verbatim
        return {genus:g,species:after.replace(/\s+/g," ").replace(/\s([Xx])\s/g," × ").trim()};
      }
      const sp=extractEpithet(after,genusList);
      return {genus:g,species:sp||""};
    }
    return null;
  }
  function matchGenusSpecies(text,genusList){ // concatenated fallback; catches genus-only hits
    const t=" "+(text||"").replace(/[_\-]+/g," ").replace(/\s+/g," ")+" ";
    let fallback=null;
    for(const g of genusList){
      const m=new RegExp("\\b"+escapeRe(g)+"\\b","i").exec(t);
      if(!m) continue;
      const sp=extractEpithet(t.slice(m.index+m[0].length),genusList);
      if(sp) return {genus:g,species:sp};
      if(!fallback) fallback={genus:g,species:""};
    }
    return fallback;
  }
  function exifDateOf(meta){ // the day the photo was taken → calendar date string
    const d=meta&&(meta.DateTimeOriginal||meta.CreateDate||meta.ModifyDate);
    if(!d)return null;
    const dt=(d instanceof Date)?d:new Date(d);
    if(isNaN(dt))return null;
    const p=n=>String(n).padStart(2,"0");
    return dt.getFullYear()+"-"+p(dt.getMonth()+1)+"-"+p(dt.getDate());
  }

  // STOP/RANK are referenced by extractEpithet above; declared here (verbatim values) so
  // the function that closes over them keeps working unchanged after the move.
  const STOP=new Set(["photo","img","image","picture","plant","plants","flower","flowers","copy","edit","edited","final","raw","jpg","jpeg","heic","png","the","and","new","sale","show","crop","cropped","scan","version","print","sp","spp","var","with","from","near","wild","seed","seedling","division","clone","form","pot","label","tag","red","green","giant","large","small","for","var.","in"]);
  const RANK=/^(var|subsp|ssp|f|forma|nothovar|cv)$/i;

  /* ===================== SPREADSHEET IMPORT — pure helpers =====================
   * Deterministic parsing for the import preview. No DOM, no network. Every guess
   * here is surfaced in the preview for the user to confirm (nothing silent). */
  const IMPORT_MONTHS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  function normWS(s){ return String(s==null?'':s).replace(/\s+/g,' ').trim(); }
  // normalize smart quotes to straight (safe; matches the species naming convention) — display use
  function normQuotes(s){ return normWS(s).replace(/[‘’]/g,"'").replace(/[“”]/g,'"'); }
  function normKey(s){ return normQuotes(s).toLowerCase(); }     // dedup key (case+space+quote-insensitive)
  function pad2(n){ return String(n).padStart(2,'0'); }
  function expandYear(y){ y=Number(y); if(y>=100) return y; return y<=49?2000+y:1900+y; }
  // Parse one acquisition-date cell. Returns {iso, precision:'day'|'month'|'year'|null, warn}.
  // Partial dates (month-only / year-only) get the 1st of the period + a precision marker.
  function parseImportDate(raw){
    const s=normWS(raw); if(!s) return {iso:null,precision:null,warn:false};
    let m;
    if((m=s.match(/^(\d{4})-(\d{2})-(\d{2})\b/)))                                  // ISO (from a real date cell)
      return {iso:`${m[1]}-${m[2]}-${m[3]}`,precision:'day',warn:false};
    if((m=s.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/))){              // M/D/Y (US sheets)
      const mo=+m[1],da=+m[2],yr=expandYear(m[3]);
      if(mo>=1&&mo<=12&&da>=1&&da<=31) return {iso:`${yr}-${pad2(mo)}-${pad2(da)}`,precision:'day',warn:mo<=12&&da<=12};
    }
    if((m=s.match(/\b([A-Za-z]{3,})\.?\s+(\d{4})\b/))){                            // "August 2020"
      const mo=IMPORT_MONTHS[m[1].slice(0,3).toLowerCase()];
      if(mo) return {iso:`${m[2]}-${pad2(mo)}-01`,precision:'month',warn:true};
    }
    if((m=s.match(/\b(\d{1,2})[\/.\-](\d{4})\b/))){                                // M/YYYY
      const mo=+m[1]; if(mo>=1&&mo<=12) return {iso:`${m[2]}-${pad2(mo)}-01`,precision:'month',warn:true};
    }
    if((m=s.match(/\b(19|20)\d{2}\b/)))                                            // year only
      return {iso:`${m[0]}-01-01`,precision:'year',warn:true};
    return {iso:null,precision:null,warn:true};                                    // unparseable → flag, don't block
  }
  // Split a COMBINED "Genus species 'Cultivar', CODE" cell. Genus = first token; a trailing
  // ", CODE" / clear accession code is peeled off. Abbreviated genus ("N.") is left for the
  // user to fix. Accession is preserved verbatim and NEVER date-mined.
  function parseCombinedName(raw){
    let s=normQuotes(raw); let accession='';
    const acc=s.match(/,\s*([A-Za-z]{1,5}[-\s]?\d{2,}[A-Za-z0-9\-]*)\s*$/);        // ", BE-3390"
    if(acc){ accession=acc[1].replace(/\s+/g,''); s=s.slice(0,acc.index).trim(); }
    const tok=s.match(/^(\S+)\s+(.*)$/);
    if(!tok) return {genus:'',species:s,accession,warn:!!s};                        // single token, no species
    let genus=tok[1], species=normWS(tok[2]);
    if(/^[A-Za-z]{1,2}\.?$/.test(genus)) return {genus:'',species:s,accession,warn:true}; // abbrev → flag
    genus=genus.charAt(0).toUpperCase()+genus.slice(1).toLowerCase();
    return {genus,species,accession,warn:false};
  }
  // Pull a "$NN" amount out of a name when there's no dedicated price column. A guess (WARN).
  function scrapePrice(raw){ const m=String(raw==null?'':raw).match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/); return m?Number(m[1]):null; }
  function cleanPrice(raw){ const s=String(raw==null?'':raw).replace(/[^0-9.]/g,''); return s===''?null:(isNaN(Number(s))?null:Number(s)); }
  // Best-effort header→field guesses (user confirms on the mapping screen).
  function guessImportMap(headers){
    const map={genus:'',species:'',combinedName:'',formDescriptor:'',vendor:'',acquisitionDate:'',price:'',accessionId:'',sourceUrl:'',locationData:'',country:'',notes:'',notes2:'',status:'',wishlist:'',acquisitionType:'',typeCategory:''};
    headers.forEach((h,i)=>{
      const t=normKey(h); if(!t) return; const set=(k)=>{ if(map[k]==='') map[k]=String(i); };
      if(/genus/.test(t)) set('genus');
      else if(/species\s*name|plant\s*name|^name$/.test(t)) set('combinedName');
      else if(/species|hybrid/.test(t)) set('species');
      if(/url|link|website/.test(t)) set('sourceUrl');
      else if(/source|vendor|origin|seller|grower|from\b/.test(t)) set('vendor');
      if(/accession|clone|my\s*plant\s*id|plant\s*id/.test(t)) set('accessionId');
      if(/date|obtained|purchased|acquired/.test(t)) set('acquisitionDate');
      if(/cost|price|paid|amount|\$/.test(t)) set('price');
      if(/^country$|^nation$|^country\s*of\s*origin$/.test(t)) set('country');
      if(/locality|wild|location\s*data|^location$/.test(t)) set('locationData');
      // "descr" also hits "Descriptor" headers — exclude those, they belong to formDescriptor below.
      // A SECOND notes-shaped column (sheets often carry both "Description" and "Notes") goes to
      // notes2 rather than being silently dropped — it's appended into the one app notes field.
      if(/note|descr|comment|growing/.test(t) && !/descriptor/.test(t)){ if(map.notes==='') set('notes'); else set('notes2'); }
      if(/status/.test(t)) set('status');
      if(/^want$|wish|interested/.test(t)) set('wishlist');
      if(/how.*acqui|acqui.*type/.test(t)) set('acquisitionType');
      if(/^type$|^plant\s*type$/.test(t)) set('typeCategory');
      if(/descriptor|form\b|variety|cultivar/.test(t)) set('formDescriptor');
    });
    return map;
  }
  // Map a free-text legacy status word to our lifecycle enum, else null (user decides).
  function guessStatus(raw){
    const t=normKey(raw);
    if(!t) return 'in_collection';
    if(/dead|died|lost|rot|kill/.test(t)) return 'dead';
    if(/sold/.test(t)) return 'sold';
    if(/trade/.test(t)) return 'traded';
    if(/gave|given|gift/.test(t)) return 'given_away';
    if(/alive|collection|have|active|growing|own|keep/.test(t)) return 'in_collection';
    return null;   // unknown → status-mapping step asks
  }
  const LIFECYCLE_STATUSES=['in_collection','dead','sold','traded','given_away'];

  return {
    uid, isHeic, thumbOf, todayLocal, sameSet,
    escapeRe, collectStrings, extractEpithet, matchGenusSpeciesFromString, matchGenusSpecies, exifDateOf,
    IMPORT_MONTHS, normWS, normQuotes, normKey, pad2, expandYear,
    parseImportDate, parseCombinedName, scrapePrice, cleanPrice, guessImportMap, guessStatus, LIFECYCLE_STATUSES
  };
});
