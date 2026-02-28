import React, { useState, useEffect, useCallback } from 'react';
import { api, FileEntry } from '../../lib/api';
import './Files.css';

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const getExt = (n: string) => { const i = n.lastIndexOf('.'); return i >= 0 ? n.slice(i).toLowerCase() : ''; };
const isImage = (n: string) => IMAGE_EXTS.includes(getExt(n));
const isPdf = (n: string) => getExt(n) === '.pdf';
const fmtSize = (b?: number) => !b ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(1)} MB`;

export default function Files() {
    const [path, setPath] = useState('');
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<FileEntry | null>(null);
    const [content, setContent] = useState<string | null>(null);
    const [fileLoading, setFileLoading] = useState(false);
    const [modal, setModal] = useState({ open: false, name: '', body: '', saving: false, error: '' });

    const loadDir = useCallback((p: string) => {
        setLoading(true);
        api.filesList(p || undefined).then(r => setFiles(r.files ?? [])).catch(() => setFiles([])).finally(() => setLoading(false));
    }, []);

    useEffect(() => { loadDir(path); }, [path, loadDir]);

    function openEntry(e: FileEntry) {
        if (e.type === 'directory') { setPath(e.path); setSelected(null); setContent(null); return; }
        setSelected(e); setContent(null); setFileLoading(true);
        api.filesRead(e.path).then(r => setContent(r.content)).catch(() => setContent('(error)')).finally(() => setFileLoading(false));
    }

    function goUp() {
        const parts = path.split('/').filter(Boolean); parts.pop();
        setPath(parts.join('/')); setSelected(null); setContent(null);
    }

    const crumbs = () => {
        const parts = path.split('/').filter(Boolean);
        return [{ label: 'Root', path: '' }, ...parts.map((p, i) => ({ label: p, path: parts.slice(0, i+1).join('/') }))];
    };

    async function saveFile() {
        if (!modal.name.trim()) { setModal(m => ({ ...m, error: 'Name required' })); return; }
        setModal(m => ({ ...m, saving: true, error: '' }));
        const fullPath = path ? `${path}/${modal.name.trim()}` : modal.name.trim();
        try { await api.filesCreate(fullPath, modal.body); setModal({ open: false, name: '', body: '', saving: false, error: '' }); loadDir(path); }
        catch (e: any) { setModal(m => ({ ...m, saving: false, error: e.message ?? 'Failed' })); }
    }

    return (
        <div className="files-page">
            <div className="files-header">
                <div><h1 className="files-header__title">Files</h1><p className="files-header__sub">Browse and manage workspace files</p></div>
                <button className="btn btn-primary" onClick={() => setModal(m => ({ ...m, open: true }))}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    New File
                </button>
            </div>

            <div className="files-body">
                <div className="files-panel glass-card">
                    <div className="files-breadcrumb">
                        {crumbs().map((c, i, arr) => (
                            <React.Fragment key={c.path + i}>
                                <button className={`files-bc-item${i===arr.length-1?' files-bc-item--active':''}`} onClick={() => { setPath(c.path); setSelected(null); setContent(null); }}>{c.label}</button>
                                {i < arr.length-1 && <span className="files-bc-sep">/</span>}
                            </React.Fragment>
                        ))}
                    </div>
                    <div className="divider" />
                    {path && <button className="files-up" onClick={goUp}>← Up</button>}
                    <div className="files-list">
                        {loading ? <div className="empty-state"><div className="spinner"/></div>
                         : files.length === 0 ? <div className="empty-state"><span>Empty directory</span></div>
                         : files.map(f => (
                            <button key={f.path} className={`files-entry${selected?.path===f.path?' files-entry--selected':''}`} onClick={() => openEntry(f)}>
                                <span className={`files-entry__icon ${f.type==='directory'?'files-entry__icon--dir':'files-entry__icon--file'}`}>
                                    {f.type==='directory'
                                        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                                        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>}
                                </span>
                                <span className="files-entry__name">{f.name}</span>
                                {f.size !== undefined && f.type==='file' && <span className="files-entry__size">{fmtSize(f.size)}</span>}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="files-viewer glass-card">
                    {selected ? (
                        <>
                            <div className="files-viewer__header">
                                <span className="files-viewer__name">{selected.name}</span>
                                {selected.size !== undefined && <span className="badge badge-accent">{fmtSize(selected.size)}</span>}
                            </div>
                            <div className="divider"/>
                            <div className="files-viewer__body">
                                {fileLoading ? <div className="empty-state"><div className="spinner"/></div>
                                 : isImage(selected.name)
                                    ? <div className="files-img-wrap"><img src={`/api/files/raw?path=${encodeURIComponent(selected.path)}`} alt={selected.name} className="files-img"/></div>
                                 : isPdf(selected.name)
                                    ? <iframe src={`/api/files/raw?path=${encodeURIComponent(selected.path)}`} className="files-pdf" title={selected.name} />
                                    : <pre className="files-code">{content ?? ''}</pre>}
                            </div>
                        </>
                    ) : (
                        <div className="empty-state" style={{height:'100%'}}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                            <span>Select a file to view its contents</span>
                        </div>
                    )}
                </div>
            </div>

            {modal.open && (
                <div className="files-modal-overlay" onClick={() => setModal(m => ({ ...m, open: false }))}>
                    <div className="files-modal glass-card" onClick={e => e.stopPropagation()}>
                        <h2 style={{fontSize:'var(--fs-md)',fontWeight:600,marginBottom:12}}>New File</h2>
                        <input className="os-input" placeholder="Filename (e.g. notes.txt)" value={modal.name} onChange={e => setModal(m => ({ ...m, name: e.target.value }))} />
                        <textarea className="os-input" style={{marginTop:10,resize:'none',minHeight:120}} placeholder="Content…" value={modal.body} onChange={e => setModal(m => ({ ...m, body: e.target.value }))} />
                        {modal.error && <p style={{fontSize:'var(--fs-xs)',color:'var(--bad)',marginTop:6}}>{modal.error}</p>}
                        <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:14}}>
                            <button className="btn btn-ghost" onClick={() => setModal(m => ({ ...m, open: false }))}>Cancel</button>
                            <button className="btn btn-primary" onClick={saveFile} disabled={modal.saving}>
                                {modal.saving ? <><div className="spinner"/> Saving…</> : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
