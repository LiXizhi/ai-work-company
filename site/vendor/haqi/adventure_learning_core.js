import {defaultParams} from './combat_params_core.js';

const pointLevels=content=>(content.balanceParams||defaultParams('kids')).skillLearning.pointLevels;
export function trainingPoints(save,content) {
    const level=save.trainingPointLevel??save.level;
    return pointLevels(content).filter(value=>value<=level).length-(save.trainingPointsSpent||0);
}
export function syncTrainingPoints(save) {
    save.trainingPointLevel=Math.max(save.trainingPointLevel||0,save.level);
    save.trainingPointsSpent??=0;
}
export function validateTrainingPoints(save,content) {
    if(save.trainingPointLevel===undefined&&save.trainingPointsSpent===undefined)return;
    if(!Number.isInteger(save.trainingPointLevel)||save.trainingPointLevel<1||save.trainingPointLevel>content.progression.levelCap||
        !Number.isInteger(save.trainingPointsSpent)||save.trainingPointsSpent<0||trainingPoints(save,content)<0)
        throw Error('存档训练点无效');
}
// CombatSkillLearn.lua L173–239, L495–531: own-school free, other-school
// exchange costs and level/prerequisite/class checks. Values come from exported exchanges.
export function skillLearningStatus(save,content,lesson) {
    const deny=reason=>({allowed:false,cost:0,reason});
    if(!lesson||lesson.supported===false)return deny('效果暂未支持');
    if(save.cards[lesson.key])return {allowed:true,cost:0,reason:'已学'};
    const entry=content.skillLearning?.courses[lesson.key];
    if(!entry)return deny('此卡需通过其他途径获得');
    const course=entry[lesson.school===save.school?'own':'other'];
    if(!course)return deny('仅本系可学习');
    if(!course.supported)return deny('特殊学习条件暂未开放');
    if(course.school&&course.school!==save.school)return deny('仅本系可学习');
    if(save.level<course.level)return deny(`${course.level}级可学习`);
    if(course.prerequisites.some(key=>!save.cards[key]))return deny('需先学习前置技能');
    const cost=course.cost;
    if(trainingPoints(save,content)<cost)return {allowed:false,cost,reason:`需要${cost}训练点`};
    return {allowed:true,cost,reason:cost?`${cost}训练点`:'本系免费'};
}
