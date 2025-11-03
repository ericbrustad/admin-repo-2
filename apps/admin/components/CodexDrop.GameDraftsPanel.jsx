// CODEx PATCH — Local-only cover image + reliable save/remove/close
// File: apps/admin/components/CodexDrop.GameDraftsPanel.jsx
//
// What this fixes (local-only):
//  • Save Cover Image works: embeds data: URL into snapshot config.game.coverImage
//  • Remove cover works and persists
//  • Media thumbnail no longer disappears (stable data URL; no premature revoke)
//  • "Close & Save Settings" button saves locally and emits settings:close
//  • Fully offline/local registry + snapshots (Supabase disabled)
//
// Registry keys:
//   erix:games:registry
//   erix:admin:drafts:slug:<slug>
//   erix:admin:published:slug:<slug>

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';

const REG_KEY = 'erix:games:registry';
const DRAFT_KEY = (slug) => `erix:admin:drafts:slug:${slug}`;
const PUB_KEY   = (slug) => `erix:admin:published:slug:${slug}`;
const STARFIELD_DEFAULT = 'Starfield Station Break';

const loadJSON = (k, f=null)=>{ try{ const r=localStorage.getItem(k); return r?JSON.parse(r):f; }catch{return f;} };
const saveJSON = (k,v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} };
const removeKey = (k)=>{ try{ localStorage.removeItem(k); }catch{} };
const nowIso = ()=> new Date().toISOString();

function slugify(s){
  return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'untitled';
}
function setPageTitle(name){ if(typeof document!=='undefined') document.title=`${name||'Admin'} — Admin`; }

function readRegistry(){ return loadJSON(REG_KEY, []); }
function writeRegistry(list){ const clean=Array.isArray(list)?list:[]; saveJSON(REG_KEY, clean); return clean; }
function upsertRegistryEntry({slug,title,channel='draft'}){
  const list=readRegistry(); const i=list.findIndex(g=>g.slug===slug);
  const entry={slug,title,channel:channel==='published'?'published':'draft',updated_at:nowIso()};
  if(i>=0) list[i]={...list[i],...entry}; else list.push(entry);
  return writeRegistry(list);
}
function removeFromRegistry(slug){ return writeRegistry(readRegistry().filter(g=>g.slug!==slug)); }
function readSnapshot(slug, channel){ return loadJSON(channel==='published'?PUB_KEY(slug):DRAFT_KEY(slug), null); }
function writeSnapshot(slug, channel, payload){
  const key=channel==='published'?PUB_KEY(slug):DRAFT_KEY(slug);
  saveJSON(key,{...(payload||{}), slug, channel, saved_at: nowIso()});
}
function deleteSnapshot(slug, channel){ removeKey(channel==='published'?PUB_KEY(slug):DRAFT_KEY(slug)); }

function seedConfig(title, slug){
  return {
    splash:{enabled:false,mode:'single'},
    game:{title,slug,mode:'single',coverImage:'',tags:[slug],shortDescription:'',longDescription:''},
    forms:{players:1},
    timer:{durationMinutes:0,alertMinutes:5},
    map:{centerLat:44.9778,centerLng:-93.2650,defaultZoom:13},
    geofence:{mode:'test'},
    icons:{missions:[],devices:[],rewards:[]},
    media:{rewardsPool:[],penaltiesPool:[]},
    devices:[]
  };
}
function seedSuite(){ return {version:'1.0.0', missions:[]}; }

// Convert File -> data URL (stable; no revoke needed)
async function fileToDataURL(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(r.result);
    r.onerror=()=>reject(r.error||new Error('read fail'));
    r.readAsDataURL(file);
  });
}

export default function CodexDropGameDraftsPanel({
  value,
  onChange,        // (value, gameMeta)
  onCloseAndSave,  // () => Promise|void
}) {
  const [games,setGames]=useState([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(null);
  const [current,setCurrent]=useState(null);
  const [title,setTitle]=useState('');
  const [slug,setSlug]=useState('');
  const [channel,setChannel]=useState('draft');

  // Cover UI state (stable)
  const [coverPreview,setCoverPreview]=useState('');  // displays current cover
  const fileInputRef = useRef(null);

  const reload = useCallback(async()=>{
    setBusy(true); setError(null);
    // merge registry + local snapshots (draft/published)
    let list = readRegistry();
    const has = new Set(list.map(g=>g.slug));
    for (const k in localStorage){
      if(!Object.prototype.hasOwnProperty.call(localStorage,k)) continue;
      if(!(k.startsWith('erix:admin:drafts:slug:') || k.startsWith('erix:admin:published:slug:'))) continue;
      const snap = loadJSON(k,null); const s = snap?.slug; if(!s) continue;
      const ch = snap?.channel || (k.includes(':published:')?'published':'draft');
      const t = snap?.title || s;
      if(has.has(s)) list=list.map(g=>g.slug===s?{...g,title:g.title||t,channel:g.channel||ch}:g);
      else { list.push({slug:s,title:t,channel:ch,updated_at:nowIso()}); has.add(s); }
    }
    if(!list.length){
      // create Default
      const s='default', t='Default Game';
      upsertRegistryEntry({slug:s,title:t,channel:'draft'});
      writeSnapshot(s,'draft',{title:t,slug:s,channel:'draft',config:seedConfig(t,s),suite:seedSuite()});
      list=readRegistry();
    }
    writeRegistry(list);
    setGames(list);
    setBusy(false);
  },[]);

  useEffect(()=>{ reload(); },[reload]);

  // Resolve current and hydrate
  useEffect(()=>{
    if(!games.length){ setCurrent(null); setTitle(''); setSlug(''); setChannel('draft'); setCoverPreview(''); return; }
    const found = games.find(g=>g.slug===value) || games[0];
    setCurrent(found);
    if(found){
      const useChannel = found.channel==='published'?'published':'draft';
      const snap = readSnapshot(found.slug, useChannel) || readSnapshot(found.slug,'draft') || {title:found.title,slug:found.slug,channel:useChannel};
      const cfg = snap?.config || null;
      setTitle(snap?.title || found.title || found.slug || STARFIELD_DEFAULT);
      setSlug(snap?.slug || found.slug);
      setChannel(useChannel);
      const cover = cfg?.game?.coverImage || '';
      setCoverPreview(cover || '');
      setPageTitle(snap?.title || found.title || found.slug);
      onChange?.(found.slug, {...found});
    }
  },[games,value,onChange]);

  // Select a game
  const handleSelect=(val)=>{
    const found=games.find(g=>g.slug===val)||null;
    setCurrent(found);
    if(found){
      const useChannel = found.channel==='published'?'published':'draft';
      const snap = readSnapshot(found.slug,useChannel) || readSnapshot(found.slug,'draft') || {title:found.title,slug:found.slug,channel:useChannel};
      const cfg = snap?.config||null;
      setTitle(snap?.title || found.title || found.slug);
      setSlug(snap?.slug || found.slug);
      setChannel(useChannel);
      setCoverPreview(cfg?.game?.coverImage || '');
      setPageTitle(snap?.title || found.title || found.slug);
      onChange?.(val,{...found});
    }else{
      onChange?.('',null);
    }
  };

  // Save (local)
  const persist = useCallback(()=>{
    if(!current) return false;
    const s = slug || slugify(title);
    const cover = coverPreview || '';
    // migrate slug
    if (s !== current.slug){
      const dSnap = readSnapshot(current.slug,'draft');
      const pSnap = readSnapshot(current.slug,'published');
      if (dSnap){
        const nextDraft = { ...dSnap, title, slug: s };
        const cfg = nextDraft.config || seedConfig(title, s);
        cfg.game = { ...(cfg.game || {}), title, slug: s, coverImage: cover };
        nextDraft.config = cfg;
        writeSnapshot(s,'draft',nextDraft);
        deleteSnapshot(current.slug,'draft');
      }
      if (pSnap){
        const nextPub = { ...pSnap, title, slug: s };
        const cfg = nextPub.config || seedConfig(title, s);
        cfg.game = { ...(cfg.game || {}), title, slug: s, coverImage: cover };
        nextPub.config = cfg;
        writeSnapshot(s,'published',nextPub);
        deleteSnapshot(current.slug,'published');
      }
      const list = readRegistry().map(g=>g.slug===current.slug?{...g,slug:s,title}:g);
      writeRegistry(list);
      setCurrent({...current,slug:s,title});
    } else {
      // upsert current snapshot in the active channel
      const existing = readSnapshot(s, channel) || {title,slug:s,channel};
      const cfg = existing.config || seedConfig(title,s);
      cfg.game = {...(cfg.game||{}), title, slug:s, coverImage: cover};
      existing.config = cfg;
      writeSnapshot(s, channel, {...existing, title, slug:s, config: cfg});
      upsertRegistryEntry({slug:s,title,channel});
    }
    setPageTitle(title);
    reload();
    return true;
  },[current,slug,title,channel,coverPreview,reload]);

  const save = ()=>{ if(persist()) alert('Saved locally.'); };

  const publish = ()=>{
    if(!current) return;
    const s = slug || current.slug;
    const target = channel==='published'?'draft':'published';
    if(!confirm(channel==='published'?`Unpublish “${title}”?`:`Publish “${title}”?`)) return;
    const existing = readSnapshot(s, channel) || {title,slug:s,channel};
    const cfg = existing.config || seedConfig(title,s);
    cfg.game = { ...(cfg.game || {}), title, slug: s, coverImage: coverPreview || '' };
    writeSnapshot(s, target, {...existing, title, slug:s, channel:target, config: cfg});
    upsertRegistryEntry({slug:s,title,channel:target});
    setChannel(target);
    reload();
  };

  const remove = ()=>{
    if(!current) return;
    if(!confirm(`Delete “${current.title}”? This cannot be undone.`)) return;
    deleteSnapshot(current.slug,'draft'); deleteSnapshot(current.slug,'published');
    removeFromRegistry(current.slug);
    reload();
    setCurrent(null); setTitle(''); setSlug(''); setCoverPreview(''); setPageTitle('Admin');
    onChange?.('',null);
  };

  // Cover management (local-only)
  const onPickFile = async (e)=>{
    const file = e?.target?.files?.[0];
    if(!file) return;
    const dataUrl = await fileToDataURL(file);
    setCoverPreview(dataUrl);  // stable preview
  };

  const saveCoverImage = ()=>{
    if(!current) return;
    // just persist with current coverPreview into config
    const ok = persist();
    if(ok) alert('Cover image saved locally.');
  };

  const removeCoverImage = ()=>{
    setCoverPreview('');
    const ok = persist();
    if(ok) alert('Cover image removed.');
  };

  const closeAndSave = async ()=>{
    persist();
    try { await onCloseAndSave?.(); } catch {}
    // notify parent to close settings
    if (typeof window !== 'undefined'){
      window.dispatchEvent(new CustomEvent('settings:close'));
    }
  }, [channel, current, handleSelect, makeList, slug, title]);

  // Options
  const options = useMemo(()=>{
    const sorted=[...games].sort((a,b)=>String(a.title||a.slug).localeCompare(String(b.title||b.slug)));
    return sorted.map(g=>({value:g.slug, label:`${g.title||g.slug}${g.channel==='published'?' (published)':' (draft)'}`}));
  },[games]);

  return (
    <div style={{ display:'grid', gap:14 }}>
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <label style={{ fontWeight:700 }}>Saved Games (Local)</label>
        <select
          disabled={busy}
          value={current?.slug || ''}
          onChange={(e)=>handleSelect(e.target.value)}
          style={{ padding:'8px 10px', borderRadius:10, border:'1px solid #d1d5db', minWidth:280 }}
        >
          <option value="" disabled>{busy ? 'Loading…' : (options.length ? 'Select a game' : 'No games found')}</option>
          {options.map(opt=> <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        <button type="button" onClick={reload} title="Reload" style={{ padding:'8px 10px', border:'1px solid #d1d5db' }}>↻ Reload</button>
        <button type="button" onClick={()=>{ const t=prompt('New Game Title'); if(!t) return; const base=slugify(t); const taken=new Set((readRegistry()||[]).map(g=>g.slug)); let s=base||'game', i=1; while(taken.has(s)) s=`${base}-${++i}`; upsertRegistryEntry({slug:s,title:t,channel:'draft'}); writeSnapshot(s,'draft',{title:t,slug:s,channel:'draft',config:seedConfig(t,s),suite:seedSuite()}); reload(); setTimeout(()=>handleSelect(s),0); }} style={{ padding:'8px 10px', border:'1px solid #94a3b8', background:'#eef2ff' }}>+ New</button>
        {error && <div style={{ color:'#b91c1c', fontSize:12 }}>Error: {error}</div>}
      </div>

      {current ? (
        <div style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'#fff' }}>
          {/* Title / Slug */}
          <div style={{ display:'grid', gap:10 }}>
            <div>
              <div style={{ marginBottom:6, fontWeight:700 }}>Game Title</div>
              <input type="text" value={title} onChange={(e)=>setTitle(e.target.value)}
                style={{ width:'100%', padding:10, border:'1px solid #d1d5db', borderRadius:10 }}
                placeholder="Enter game title" />
            </div>

            <div>
              <div style={{ marginBottom:6, fontWeight:700 }}>Slug</div>
              <div style={{ display:'flex', gap:8 }}>
                <input type="text" value={slug} onChange={(e)=>setSlug(slugify(e.target.value))}
                  style={{ flex:1, padding:10, border:'1px solid #d1d5db', borderRadius:10 }}
                  placeholder="game-slug" />
                <button type="button" onClick={()=>setSlug(slugify(title))}
                  style={{ padding:'8px 12px', border:'1px solid #cbd5e1', borderRadius:10 }}>Auto</button>
              </div>
            </div>

            {/* Cover Image */}
            <div style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:10, background:'#fafafa' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                <div style={{ fontWeight:700 }}>Cover Image</div>
                <div style={{ fontSize:12, color:'#64748b' }}>Stored locally in snapshot</div>
              </div>
              <div style={{ display:'grid', gap:10, gridTemplateColumns:'1fr auto', alignItems:'center' }}>
                <div style={{ minHeight:120, border:'1px solid #e5e7eb', borderRadius:10, display:'grid', placeItems:'center', background:'#fff' }}>
                  {coverPreview ? (
                    <img src={coverPreview} alt="cover" style={{ maxWidth:'100%', maxHeight:240, objectFit:'contain', borderRadius:8 }} />
                  ) : (
                    <div style={{ color:'#64748b', fontSize:13 }}>No cover selected</div>
                  )}
                </div>
                <div style={{ display:'grid', gap:8 }}>
                  <button type="button" onClick={()=>fileInputRef.current?.click()}
                    style={{ padding:'8px 12px', border:'1px solid #94a3b8', borderRadius:10, background:'#f8fafc' }}>
                    Upload…
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }}
                    onChange={onPickFile} />
                  <button type="button" onClick={saveCoverImage}
                    style={{ padding:'8px 12px', border:'1px solid #16a34a', background:'#dcfce7', borderRadius:10, fontWeight:700 }}>
                    Save Cover Image
                  </button>
                  <button type="button" onClick={removeCoverImage}
                    style={{ padding:'8px 12px', border:'1px solid #ef4444', background:'#fee2e2', color:'#991b1b', borderRadius:10, fontWeight:700 }}>
                    Remove
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <button type="button" onClick={save}
                style={{ padding:'10px 14px', border:'1px solid #16a34a', background:'#dcfce7', borderRadius:12, fontWeight:700 }}>Save (Local)</button>
              <button type="button" onClick={publish}
                style={{ padding:'10px 14px', border:'1px solid #0ea5e9', background:'#e0f2fe', borderRadius:12, fontWeight:700 }}>
                {channel==='published' ? 'Set to Draft' : 'Publish (Local)'}
              </button>
              <button type="button" onClick={remove}
                style={{ padding:'10px 14px', border:'1px solid #ef4444', background:'#fee2e2', color:'#991b1b', borderRadius:12, fontWeight:700 }}>Delete</button>
              <div style={{ flex:1 }} />
              <button type="button" onClick={closeAndSave}
                style={{ padding:'10px 14px', border:'1px solid #93c5fd', background:'#dbeafe', color:'#1e40af', borderRadius:12, fontWeight:800, minWidth:220 }}>
                Close & Save Settings
              </button>
            </div>

            <div style={{ fontSize:12, color:'#64748b' }}>
              Channel: <strong>{channel}</strong> • Source: <strong>Local</strong>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ color:'#6b7280', fontSize:13 }}>Select a game or click “+ New”.</div>
      )}
    </div>
  );
}

export function useCodexGames() {
  const [games, setGames] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (!hasStorage()) {
        setGames([]);
        return;
      }
      await ensureRegistryBootstrapped();
      setGames(readRegistry() || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load games';
      setError(message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    reload();
    if (!hasStorage()) return undefined;
    const handler = (event) => {
      const key = event?.key || '';
      if (!key || key === REG_KEY || key.startsWith('erix:admin:drafts') || key.startsWith('erix:admin:published')) {
        reload();
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [reload]);

  const handleClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (onSave) {
        await onSave();
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('settings:close'));
      }
    } finally {
      setBusy(false);
    }
  }, [busy, onSave]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      style={{
        padding: '10px 14px',
        borderRadius: 12,
        border: '1px solid #93c5fd',
        background: '#dbeafe',
        color: '#1e40af',
        fontWeight: 800,
        minWidth: 220,
      }}
      title="Save all settings and close"
    >
      {busy ? 'Saving…' : label}
    </button>
  );
}

export { useCodexGames } from '../hooks/useCodexGames.js';
