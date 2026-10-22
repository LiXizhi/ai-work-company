import {petTraitRows,petTraitParams,PET_TRAITS} from './adventure_pet_traits_core.js';
import {tr,fill} from './locale_runtime.js';

export const traitRankLabel=rank=>fill(rank>6?'传奇{level}级':'{level}级',{level:rank>6?rank-6:rank}).text;
export function traitEffectText(row){return fill('{effect} {sign}{value}%',{effect:tr(row.effect),sign:row.key==='frugal'?'−':'+',value:row.value}).text;}
export function petTraitText(traits={},params){return petTraitRows(traits,params).map(row=>`${tr(row.name)} ${traitRankLabel(row.rank)} · ${traitEffectText(row)}`).join('；');}
export function createPetTraitBadges(traits,content,el,{compact=false}={}){
    const list=el('div',`pet-trait-badges${compact?' is-compact':''}`);
    list.setAttribute('aria-label',tr('宠物属性标签'));
    for(const row of petTraitRows(traits,petTraitParams(content))){
        const label=`${tr(row.name)} ${traitRankLabel(row.rank)}`;
        const badge=el('span',`pet-trait-badge trait-rank-${row.rank}`,label);
        badge.title=traitEffectText(row);badge.setAttribute('aria-label',`${label}，${badge.title}`);
        if(!compact)badge.append(el('small','',badge.title));
        list.append(badge);
    }
    if(!list.children.length)list.append(el('small','muted',tr('暂无属性标签')));
    return list;
}
export function traitUpgradeText(rows){return rows.map(row=>`${tr(PET_TRAITS[row.key].name)} ${row.from?traitRankLabel(row.from):tr('未获得')} → ${traitRankLabel(row.to)}`).join('；');}
export function drawPetTraitHalo(ctx,traits={},x=0,y=0,radius=36){
    const rank=Math.max(0,...Object.values(traits));if(rank<7)return;
    const color=rank===7?'#a98cff':rank===8?'#ffd45c':'#ff83b8';
    ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.globalAlpha*=.22;
    ctx.beginPath();ctx.ellipse(x,y,radius,radius*.3,0,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=Math.min(1,ctx.globalAlpha*3);ctx.lineWidth=2;ctx.stroke();
    ctx.beginPath();ctx.ellipse(x,y,radius*.8,radius*.22,0,0,Math.PI*2);ctx.stroke();ctx.restore();
}
