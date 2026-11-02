import {noteCatalogSignal} from './adventure_catalog_quests_core.js';

// Record an actual meal, never infer feeding from battle/duplicate reward XP.
export function recordPetMeal(save,content){
 save.tips.petFed=true;
 const quest=content.quests?.find(q=>!save.quests[q.id]?.claimed);
 if(quest&&save.quests[quest.id]?.accepted)for(const goal of quest.goals){
  if(goal.kind==='action'&&Number(goal.id)===79019)save.quests[quest.id].progress['action:79019']=goal.count;
 }
 noteCatalogSignal(save,content,'custom',79019,1);
}
