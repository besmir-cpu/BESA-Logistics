// In-memory edit revisions, scoped to a workspace and its week.
// No personal data is persisted in browser storage.
const revisions=new Map(),dirty=new Set();
export const draftId=({workspace,key})=>workspace+':'+key;
export function revision(identity){return revisions.get(draftId(identity))||0;}
export function changed(identity){
  const id=draftId(identity);revisions.set(id,revision(identity)+1);dirty.add(id);
  window.dispatchEvent(new Event('besa:draft-state'));
}
export function clean(identity,expected=revision(identity)){
  if(revision(identity)===expected)dirty.delete(draftId(identity));
  window.dispatchEvent(new Event('besa:draft-state'));
}
export function isDirty(identity){return dirty.has(draftId(identity));}
export function hasUnsaved(){return dirty.size>0;}
export function contextChanged(){window.dispatchEvent(new Event('besa:draft-context'));}
export function assertCurrent(bridge,identity,expected){
  if(draftId(bridge.identify())!==draftId(identity)||revision(identity)!==expected)
    throw new Error('The tab, week or draft changed while loading. Nothing was replaced. Return to the intended workspace and load again.');
}
