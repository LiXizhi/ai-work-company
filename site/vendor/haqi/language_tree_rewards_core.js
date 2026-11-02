import {validateMasteryList} from './language_tree_dictionary_core.js';
// Only call with a server-acknowledged, cumulative mastery list.
export function claimTreeMasteryRewards(save,language,words){
 if(!['en','zh'].includes(language))throw Error('不支持的掌握清单');
 const confirmed=validateMasteryList({en:[],zh:[],[language]:words});
 const claimed=validateMasteryList(save.languageTreeClaims);
 const pending=confirmed[language].filter(id=>!claimed[language].includes(id));
 const amount=pending.length*50,total=(save.inventory[100]||0)+amount;
 if(!Number.isSafeInteger(total)||total<0)throw Error('奇豆数量无效');
 if(!amount)return 0;
 save.languageTreeClaims={...claimed,[language]:[...claimed[language],...pending].sort()};
 save.inventory[100]=total;
 return amount;
}
export function validateTreeClaims(save){if(save.languageTreeClaims!==undefined)validateMasteryList(save.languageTreeClaims);}
