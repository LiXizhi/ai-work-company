// Display-only projection. Keep this independent of the lexicon module so an
// already-open page with the previous lexicon exports can still load WordTree.
export function wordTreeDisplayState(state,index){
 const ids=index.data.displayIds||new Set(index.entries.keys());
 return {...state,words:Object.fromEntries(Object.entries(state.words).filter(([id])=>ids.has(id)))};
}
