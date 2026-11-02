// Presentation only. Parameters and effect dictionaries come from the battle's resolved data.
// Translation is injected by the view; this module stays independent of browser locale state.
// 内容范围约定（AGENTS.md）：效果收录只针对儿童版（kids）；teen 专属 type 不在此扩展。
import {cardTargetKind} from './combat_cards_core.js';
import {inferTargetKind} from './combat_params_core.js';
import {statIdToEntry} from './combat_unit_core.js';
const schools={fire:'烈火',ice:'寒冰',storm:'风暴',life:'生命',death:'死亡',balance:'平衡',all:'任意系'};
const list=value=>String(value??'').split(',').map(s=>s.trim()).filter(Boolean);

export function describeCard(card,{dataset={},cooldown,translate=value=>value}={}) {
    const t=(pattern,vars={})=>String(translate(pattern)).replace(/\{(\w+)\}/g,(token,key)=>key in vars?translate(String(vars[key])):token);
    const schoolName=value=>t(schools[value]||'魔法');
    const amount=value=>/^\d+p$/.test(String(value))?t('{amount}×魔力',{amount:String(value).slice(0,-1)}):String(value??0);
    const range=(a,b=a)=>String(a)===String(b)?amount(a):t('{min}～{max}',{min:amount(a),max:amount(b)});
    const ticks=value=>{const values=list(value);return values.every(v=>v===values[0])?t('{amount}×{rounds}回合',{amount:amount(values[0]),rounds:values.length}):values.map(amount).join(t('、'));};
    const signed=value=>(Number(value)>=0?'+':'-')+Math.abs(Number(value));
    const p=card.params||{},type=card.type||'';
    const charms=dataset.charms?.charm||dataset.charms||{},wards=dataset.charms?.ward||dataset.wards||{};
    const miniauras=dataset.miniauras||dataset.charms?.miniaura||{};
    const kind=card.target||inferTargetKind(card,{charm:charms,ward:wards})||cardTargetKind(card);
    let target=t(kind==='friendly'?'自己或一名友方':kind==='self'?'自己':'一名敌人');
    if(type.startsWith('Area'))target=t(/Heal|Absorb|Cleanse|PowerPip/.test(type)?'全体友方':'全体敌人');
    if(type==='ArenaAttack')target=t('全场所有角色');
    if(type==='AreaCharm')target=t([true,'true'].includes(charms[list(p.charm??p.charms)[0]]?.positive)?'全体友方':'全体敌人');
    if(type==='AreaWard')target=t([false,'false'].includes(wards[list(p.ward??p.wards)[0]]?.positive)?'全体敌人':'全体友方');
    const summary=[],lines=[];
    let complete=['SingleAttack','AreaAttack','ArenaAttack','SingleAttackWithDOT','AreaAttackWithDOT','AreaDOTAttack','DOTAttack','DOTAttackWithHOT','SingleHeal','SingleHealWithHOT','AreaHeal','AreaHealWithHOT','AreaHealWithAbsorb','Absorb','AreaAbsorb','Charms','Wards','AreaCharm','AreaWard','Pass',
        // 以下攻击/治疗变体的数值行已覆盖全部效果，无需特殊分支
        'SingleAttackWithImmolate','AreaAttackWithImmolate','SingleAttackWithLifeTap','AreaAttackWithLifeTap','SingleHealWithImmolate','SingleAttackWithMultipleDamage',
    ].includes(type);

    // player_server.lua GetStatsSum：standing ward / miniaura 的 stats 串 "(120,70)" → 效果短语
    const statsText=stats=>{
        const parts=[];let known=true;
        const re=/\((\d+)\s*,\s*(-?\d+)\)/g;let m;
        while((m=re.exec(String(stats||'')))){
            const entry=statIdToEntry(m[1]),v=Number(m[2]);
            if(!entry){known=false;continue;}
            const school=schoolName(entry.school||'all');
            const s=signed(entry.stat==='resistPct'?-v:v);
            if(entry.stat==='hpFlat')parts.push(t('生命值 {v}',{v:s}));
            else if(entry.stat==='powerPipPct')parts.push(t('超级魔力点生成率 {v}%',{v:s}));
            else if(entry.stat==='accuracyPct')parts.push(t('{school}命中 {v}%',{school,v:s}));
            else if(entry.stat==='damagePct')parts.push(t('{school}攻击伤害 {v}%',{school,v:s}));
            else if(entry.stat==='resistPct')parts.push(t('受到的{school}伤害 {v}%',{school,v:s}));
            else if(entry.stat==='critPct')parts.push(t('暴击率 {v}%',{v:s}));
            else if(entry.stat==='resiliencePct')parts.push(t('韧性 {v}%',{v:s}));
            else if(entry.stat==='penetration')parts.push(t('无视{school}抗性 {v}%',{school,v:s}));
            else if(entry.stat==='outputHealPct')parts.push(t('施放治疗效果 {v}%',{v:s}));
            else if(entry.stat==='inputHealPct')parts.push(t('受到治疗效果 {v}%',{v:s}));
            else if(entry.stat==='hpPct')parts.push(t('生命上限 {v}%',{v:s}));
            else known=false;
        }
        return {text:parts.join(t('；')),known};
    };

    // 单次触发类 charm/ward（boost_damage / 棱镜 / 驱散 / 眩晕抵挡 / 命中 / 治疗等，触发一次后消耗）
    // processDamageAgainstWards consumes a matching prism and changes the RECEIVED school.
    // Absorption reduces capacity, whereas percentage wards modify one matching damage event.
    const triggerText=(effect,charm,tgt)=>{
        if(!effect)return null;
        if(effect.dispel_school){
            const school=schoolName(effect.dispel_school);
            return {short:t('下次{school}施法失败',{school}),known:true,lines:[
                t('使{target}下一次{school}攻击或施法失败（MISS），触发后消耗一层此效果；其他学系不会触发。',{target:tgt,school}),
                t('通过命中判定后仍会消耗本次魔力；若本身命中失误，则不扣魔力，但仍消耗此效果。免疫此效果的怪物不受强制失败影响。'),
            ]};
        }
        if(effect.prism_from&&effect.prism_to){
            const from=schoolName(effect.prism_from),to=schoolName(effect.prism_to);
            return {short:t('{from}伤害→{to}伤害',{from,to}),known:true,lines:[
                t('给{target}放置棱镜。当该目标下一次受到{from}伤害时，将这次伤害转换为{to}伤害，并消耗棱镜；其他系伤害不会触发这个棱镜。',{target:tgt,from,to}),
                t('转换的是目标受到的伤害，不是目标发出的攻击，也不会改变卡牌或角色的学系。转换后按新学系的抗性结算。'),
                t('用途：如果敌人抵抗{from}、却不擅长抵抗{to}，先放棱镜，再用{from}攻击它。伤害不保证增加，仍取决于它对两系的抗性。',{from,to}),
                t('棱镜与护盾、陷阱按后放先处理的顺序结算；搭配使用时，放置顺序会影响哪些效果触发。'),
            ]};
        }
        if([true,'true'].includes(effect.stunabsorb)){
            return {short:t('抵挡一次眩晕'),known:true,lines:[t('为{target}抵挡下一次眩晕，触发后消耗护盾；不会吸收生命伤害。',{target:tgt})]};
        }
        if(effect.boost_damage!==undefined){
            const percent=Number(effect.boost_damage),vars={target:tgt,school:schoolName(effect.school||'all'),percent:Math.abs(percent)};
            return {short:t(charm?(percent>=0?'下次{school}攻击加 {percent}%':'下次{school}攻击减 {percent}%'):(percent>=0?'受到的{school}攻击加 {percent}%':'受到的{school}攻击减 {percent}%'),vars),
                known:true,lines:[
                    t(charm?(percent>=0?'使{target}下一次匹配的{school}攻击伤害提高 {percent}%，触发后消耗此术。':'使{target}下一次匹配的{school}攻击伤害降低 {percent}%，触发后消耗此术。'):(percent>=0?'给{target}放置陷阱，使其下一次受到的{school}攻击伤害提高 {percent}%，触发后陷阱消失。':'为{target}施加减伤盾，使其下一次受到的{school}攻击伤害降低 {percent}%，触发后护盾消失。'),vars),
                    ...(!charm&&percent<0?[t('减伤盾按比例减少一次匹配的伤害；吸收盾则有固定容量，可以分多次扣除。')]:[]),
                ]};
        }
        // processStatAgainstCharms 在施法时弹出匹配学系的命中 charm（card_server.lua L2514+）
        if(effect.boost_accuracy!==undefined){
            const percent=Number(effect.boost_accuracy),school=schoolName(effect.school||'all');
            if(percent<=-100)return {short:t('下次施法必然失误'),known:true,lines:[t('使{target}下一次任意施法必然失误（MISS），触发后消耗此术。',{target:tgt})]};
            return {short:t('下次{school}施法命中 {percent}%',{school,percent:signed(percent)}),known:true,lines:[t('使{target}下一次{school}施法的命中 {percent}%，触发后消耗此术。',{target:tgt,school,percent:signed(percent)})]};
        }
        // casterHealBuffs / processHealAgainstWards 在施放或受到治疗时消耗
        if(effect.boost_heal!==undefined){
            return {short:t('下次治疗 {percent}%',{percent:signed(effect.boost_heal)}),known:true,lines:[
                t(charm?'使{target}下一次施放治疗时，治疗效果 {percent}%，触发后消耗此术。':'使{target}下一次受到的治疗效果 {percent}%，触发后消耗此术。',{target:tgt,percent:signed(effect.boost_heal)})]};
        }
        if(effect.desc)return {short:t(effect.desc),known:false,lines:[t('对{target}施加：{effect}。',{target:tgt,effect:t(effect.desc)})]};
        return {short:'',known:false,lines:[]};
    };

    // 持续类 standing ward：stats 计入 GetStatsSum；仅有 desc 且无已知字段的条目在引擎中无效果
    const standingText=(effect,rounds,tgt)=>{
        if(!effect)return null;
        if(effect.stats){
            const s=statsText(effect.stats);
            if(s.known&&s.text)return {short:s.text,known:true,line:t('对{target}施加持续效果：{effect}，持续 {rounds} 回合。',{target:tgt,effect:s.text,rounds})};
        }
        if(effect.desc)return {short:t(effect.desc),known:true,line:t('对{target}施加持续效果：{effect}，持续 {rounds} 回合（该效果在当前模拟器中未实现）。',{target:tgt,effect:t(effect.desc),rounds})};
        return {short:'',known:false,line:''};
    };

    if(type==='SingleAttackWithPercent'){
        summary.push(t('伤害为目标当前生命的 {percent}%',{percent:p.damage_percent||0}));
        lines.push(t('对{target}造成其当前生命 {percent}% 的基础伤害，无视目标抗性，另受此牌的伤害上限限制。',{target,percent:p.damage_percent||0}));
        if(p.immolate_damage_percent!==undefined)lines.push(t('原版此牌还会同时对自身造成 {percent}% 当前生命的伤害；该自伤在当前模拟器中未实现。',{percent:p.immolate_damage_percent}));
        complete=true;
    }else if(p.damage_min!==undefined){
        const damage=range(p.damage_min,p.damage_max??p.damage_min),multiple=type==='SingleAttackWithMultipleDamage';
        summary.push(t(multiple?'每段基础 {amount}':'伤害 {amount}',{amount:damage}));
        lines.push(t('对{target}立即造成 {amount} 点{school}基础伤害。',{target,amount:damage,school:schoolName(p.damage_school||card.spellSchool)}));
        if(multiple)lines.push(t('分段攻击 {times} 次；特殊段数可能使用不同伤害。',{times:p.random_times?list(p.random_times).join(t('～')):p.times||1}));
    }
    function periodic(value,heal=false){
        const values=list(value),same=values.every(v=>v===values[0]);
        summary.push(t(heal?'持续治疗 {ticks}':'持续 {ticks}',{ticks:ticks(value)}));
        const schedule=same?t('每回合 {amount}',{amount:amount(values[0])}):t('各回合依次为 {amounts}',{amounts:values.map(amount).join(t('、'))});
        lines.push(t(heal?'为{target}附加持续治疗：{rounds} 回合，{schedule} 点基础生命值。':'对{target}附加持续伤害：{rounds} 回合，{schedule} 点基础伤害。',{target:heal&&type==='DOTAttackWithHOT'?t('自己'):target,rounds:values.length,schedule}));
    }
    if(p.dots!==undefined)periodic(p.dots);
    if(p.heal_min!==undefined){const heal=range(p.heal_min,p.heal_max??p.heal_min);summary.push(t('治疗 {amount}',{amount:heal}));lines.push(t('立即为{target}恢复 {amount} 点基础生命值。',{target,amount:heal}));}
    if(p.hots!==undefined)periodic(p.hots,true);
    if(p.absorb_pts!==undefined){
        summary.push(t('吸收 {amount}',{amount:amount(p.absorb_pts)}));
        lines.push(t('为{target}施加护盾，累计吸收 {amount} 点伤害。护盾不会恢复已经损失的生命。',{target,amount:amount(p.absorb_pts)}));
        lines.push(t('吸收就是替你承受伤害：结算到护盾的伤害先扣护盾容量，超过剩余容量的部分才扣生命；没用完的容量保留，用完后护盾消失。'));
        if(Number(p.absorb_pts)>=200)lines.push(t('例如：护盾剩余 {capacity} 点，承受一次 200 点伤害后，生命不减少，护盾还剩 {remaining} 点。',{capacity:p.absorb_pts,remaining:Number(p.absorb_pts)-200}));
    }
    for(const [key,periodicKey] of [['damage','dots'],['heal','hots']]){
        if(!['SingleAttackWithDOT','SingleHealWithHOT'].includes(type)||!list(p[periodicKey]).length)continue;
        const values=[p[`${key}_min`]??0,p[`${key}_max`]??p[`${key}_min`]??0,...list(p[periodicKey])].map(Number);
        if(values.every(Number.isFinite)){
            const total=values.slice(2).reduce((a,b)=>a+b,0);
            lines.push(t(key==='damage'?'基础总伤害：{amount} 点（即时效果与持续效果合计，并非一次生效）。':'基础总治疗：{amount} 点（即时效果与持续效果合计，并非一次生效）。',{amount:range(values[0]+total,values[1]+total)}));
        }
    }
    if(['Charms','Wards','AreaCharm','AreaWard'].includes(type)){
        const charm=/Charm/.test(type),ids=list(charm?p.charms??p.charm:p.wards??p.ward);
        for(const id of ids){
            const r=triggerText(charm?charms[id]:wards[id],charm,target);
            if(!r){complete=false;continue;}
            summary.push(r.short);lines.push(...r.lines);
            if(!r.known)complete=false;
        }
    }
    if(type==='StandingWards'){
        let ok=true;
        for(const id of list(p.wards??p.ward)){
            const r=standingText(wards[id],p.rounds||1,target);
            if(!r||!r.known){ok=false;continue;}
            summary.push(r.short);lines.push(r.line);
        }
        if(ok)complete=true;
    }
    if(/LifeTap/.test(type))lines.push(t('将实际造成伤害的 {percent}% 转为自己的生命回复。',{percent:p.convert_rate||0}));
    if(/Immolate/.test(type)&&!/Guardian/.test(type)&&p.immolate_damage_min!==undefined)lines.push(t('施法同时对自己造成 {amount} 点基础伤害。',{amount:range(p.immolate_damage_min,p.immolate_damage_max)}));
    if(type==='ArenaAttack')lines.push(t('友方承受的直接伤害减半。'));
    if(type==='Pass'){summary.push(t('跳过本回合'));lines.push(t('跳过本回合，不施放法术。'));}

    // card_server.lua L3167-3200：眩晕附加 {n} 层眩晕抵挡，防止连续眩晕
    const stunAbsorbCount=dataset.version==='teen'?2:4;
    const stunNote=()=>lines.push(t('被眩晕的目标会同时获得 {count} 层眩晕抵挡，用于抵挡后续眩晕，每次抵挡消耗一层。',{count:stunAbsorbCount}));
    if(type==='SingleStun'){summary.push(t('眩晕一名敌人'));lines.push(t('使{target}眩晕，跳过其下一次行动。',{target}));stunNote();complete=true;}
    if(type==='AreaStun'){summary.push(t('眩晕全体敌人'));lines.push(t('使全体敌人眩晕，各自跳过其下一次行动。'));stunNote();complete=true;}
    if(type==='SingleAttackWithStun'){lines.push(t('并使{target}眩晕，跳过其下一次行动。',{target}));stunNote();complete=true;}
    if(type==='AreaAttackWithStun'){lines.push(t('并使全体敌人眩晕，各自跳过其下一次行动。'));stunNote();complete=true;}
    if(type==='SingleAttackWithSelfStun'){lines.push(t('施法后自己也会眩晕，跳过自己的下一次行动。'));complete=true;}
    if(type==='SingleHealWithCleanse'){lines.push(t('施法同时净化{target}：清除其全部持续伤害、减益术与负面护盾。',{target}));complete=true;}
    if(type==='SingleAttackWithTrap'&&p.target_wards){
        let ok=true;
        for(const id of list(p.target_wards)){
            const r=triggerText(wards[id],false,target);
            if(!r||!r.known){ok=false;continue;}
            summary.push(r.short);lines.push(...r.lines);
        }
        if(ok)complete=true;
    }
    if(['SingleAttackWithStandingWards','SingleAttackWithLifeTapAndStandingWards'].includes(type)&&p.wards){
        let ok=true;
        for(const id of list(p.wards)){
            const r=standingText(wards[id],p.rounds||1,target);
            if(!r||!r.known){ok=false;continue;}
            summary.push(r.short);lines.push(r.line);
        }
        if(ok)complete=true;
    }
    if(type==='SymmetryWards'){
        let ok=true;
        for(const id of list(p.target_wards??p.wards??p.ward)){
            const r=triggerText(wards[id],false,target);
            if(!r||!r.known){ok=false;continue;}
            summary.push(r.short);lines.push(...r.lines);
        }
        for(const id of list(p.caster_wards)){
            const r=triggerText(wards[id],false,t('自己'));
            if(!r||!r.known){ok=false;continue;}
            summary.push(r.short);lines.push(...r.lines);
        }
        if(ok)complete=true;
    }
    if(type==='SingleAttackWithExplode'){
        summary.push(t('引暴溅射 {amount}',{amount:range(p.damage_min_explode,p.damage_max_explode)}));
        lines.push(t('对{target}造成伤害；若目标身上已有「溅射」持续伤害，本次改为造成 {amount} 点爆炸伤害，并移除该溅射。',{target,amount:range(p.damage_min_explode,p.damage_max_explode)}));
        complete=true;
    }
    if(type==='AreaAttackWithExtraThreat'){
        lines.push(t('此牌对怪物产生的威胁提高至伤害的 {ratio} 倍，更容易吸引怪物攻击。',{ratio:p.threat_ratio||1}));
        complete=true;
    }

    // card_server.lua L5213 Global：全场光环，双方生效，持续到被替换
    if(type==='Global'){
        const auraSchool=schoolName(p.school||card.spellSchool);
        if(p.boost_damage!==undefined){
            summary.push(t('场地光环：{school}伤害 {percent}%',{school:auraSchool,percent:signed(p.boost_damage)}));
            lines.push(t('设置全场场地光环，对双方所有角色生效：{school}伤害 {percent}%，持续到被其他场地光环替换。',{school:auraSchool,percent:signed(p.boost_damage)}));
            complete=true;
        }else if(p.boost_heal!==undefined){
            summary.push(t('场地光环：治疗效果 {percent}%',{percent:signed(p.boost_heal)}));
            lines.push(t('设置全场场地光环，对双方所有角色生效：治疗效果 {percent}%，持续到被其他场地光环替换。',{percent:signed(p.boost_heal)}));
            complete=true;
        }else if(p.boost_powerpip!==undefined){
            summary.push(t('场地光环：超级魔力点生成率 {percent}%',{percent:signed(p.boost_powerpip)}));
            lines.push(t('设置全场场地光环，对双方所有角色生效：超级魔力点生成率 {percent}%，持续到被其他场地光环替换。',{percent:signed(p.boost_powerpip)}));
            complete=true;
        }
    }
    // MiniAura：自身小光环（rounds），stats 经 GetStatsSum 计入
    if(type==='MiniAura'){
        const tpl=miniauras[p.miniaura],stat=tpl?statsText(tpl.stats):null;
        if(stat&&stat.known&&stat.text){
            summary.push(stat.text);
            lines.push(t('使自己获得光环，持续 {rounds} 回合：{effect}。',{rounds:p.rounds||3,effect:stat.text}));
            complete=true;
        }else if(tpl?.desc){
            summary.push(t(tpl.desc));lines.push(t('对{target}施加：{effect}。',{target,effect:t(tpl.desc)}));
        }
    }
    // Stance：姿态（player_server.lua GetOutputDamageFinalWeight / GetReceiveDamageFinalWeight / GetGenerateThreatFinalWeight 及各 Get* 同队加成）
    if(type==='Stance'){
        const rounds=p.rounds||5,schoolOnly=t('此姿态只有同学系的角色才能施放。');
        const stanceTable={
            defensive:{short:()=>t('攻击与受伤均 -25%'),lines:()=>[
                t('进入防守姿态 {rounds} 回合：自己的攻击伤害 -25%，受到的伤害 -25%。',{rounds}),
                t('防守姿态期间，自己对怪物产生的仇恨提高至 3 倍。'),schoolOnly]},
            taunt:{short:()=>t('仇恨提高至 5 倍'),lines:()=>[
                t('进入嘲讽姿态 {rounds} 回合：自己对怪物产生的仇恨提高至 5 倍，用于保护队友。',{rounds})]},
            fire_kids:{short:()=>t('全队攻击伤害 +15%'),lines:()=>[
                t('进入烈焰姿态 {rounds} 回合：自己受到的伤害 +10%。',{rounds}),
                t('队伍中任意角色持有烈焰姿态期间：全队攻击伤害 +15%（同类姿态不叠加）。'),schoolOnly]},
            ice_kids:{short:()=>t('全队受到的伤害 -10%'),lines:()=>[
                t('进入寒冰姿态 {rounds} 回合：自己的攻击伤害 -10%。',{rounds}),
                t('队伍中任意角色持有寒冰姿态期间：全队受到的伤害 -10%（同类姿态不叠加）。'),schoolOnly]},
            storm_kids:{short:()=>t('全队暴击率 +20%'),lines:()=>[
                t('进入风暴姿态 {rounds} 回合：自己受到的伤害 +10%。',{rounds}),
                t('队伍中任意角色持有风暴姿态期间：全队暴击率 +20%，暴击伤害 +20%（同类姿态不叠加）。'),schoolOnly]},
            life_kids:{short:()=>t('全队穿透 +15%'),lines:()=>[
                t('进入生命姿态 {rounds} 回合：自己受到的伤害 +10%。',{rounds}),
                t('队伍中任意角色持有生命姿态期间：全队无视抗性 +15%（同类姿态不叠加）。'),schoolOnly]},
            death_kids:{short:()=>t('全队韧性 +20%'),lines:()=>[
                t('进入死亡姿态 {rounds} 回合：自己受到的伤害 +10%。',{rounds}),
                t('队伍中任意角色持有死亡姿态期间：全队韧性 +20%、命中 +10%、受到治疗效果 +30%（同类姿态不叠加）。'),schoolOnly]},
        };
        const entry=stanceTable[String(p.stance||'')];
        if(entry){summary.push(entry.short());entry.lines().forEach(l=>lines.push(l));complete=true;}
    }
    if(type==='AreaPowerPipBoost'){
        const n=Number(p.powerpips||1);
        if(dataset.version==='teen'){
            summary.push(t('全体友方普通魔力 +{count}',{count:n*2}));
            lines.push(t('为全体友方增加 {count} 点普通魔力，不超过魔力上限。',{count:n*2}));
        }else{
            summary.push(t('全体友方超级魔力 +{count}',{count:n}));
            lines.push(t('为全体友方增加 {count} 个超级魔力点（本系卡牌每个按 2 点魔力计费），不超过魔力上限。',{count:n}));
        }
        complete=true;
    }
    if(type==='SingleStealth'){
        summary.push(t('隐身 {rounds} 回合',{rounds:p.rounds||2}));
        lines.push(t('使{target}隐身 {rounds} 回合：敌方无法用单体攻击选中它，群体攻击与治疗不受影响。',{target,rounds:p.rounds||2}));
        lines.push(t('目标施法或受到伤害后，隐身立即消失。'));
        complete=true;
    }

    const simple={
        SingleCleanse:()=>t('净化{target}的负面效果。',{target}),AreaCleanse:()=>t('净化全体友方的负面效果。'),
        GainPips:()=>t('为{target}增加 {count} 点普通魔力，不超过魔力上限。',{target,count:p.pips||1}),
        SingleTaunt:()=>t('嘲讽{target}，将自己对目标怪物的仇恨提高至最高仇恨并追加 {count} 点。',{target,count:p.additional_threat||0}),
        AreaTaunt:()=>t('嘲讽全体敌方怪物，逐个提高自己的仇恨并追加 {count} 点。',{count:p.additional_threat||0}),
        RemovePositiveCharm:()=>t('随机移除{target}最多 {count} 个增益术。',{target,count:p.remove_count||1}),
        RemoveNegativeCharm:()=>t('随机移除{target}最多 {count} 个减益术。',{target,count:p.remove_count||1}),
        RemovePositiveWard:()=>t('随机移除{target}最多 {count} 个正面护盾。',{target,count:p.remove_count||1}),
        StealCharm:()=>t('从{target}随机偷取最多 {count} 个增益术，转移到自己身上。',{target,count:p.steal_count||1}),
        StealWard:()=>t('从{target}随机偷取最多 {count} 个正面护盾，转移到自己身上。',{target,count:p.steal_count||1}),
    };
    if(simple[type]){const text=simple[type]();summary.push(text);lines.push(text);complete=true;}
    if(type==='ReflectionShield'){
        summary.push(t('魔镜吸收 {amount}，反弹直接伤害',{amount:amount(p.reflect_amount)}));
        lines.push(t('为{target}附加头顶魔镜，累计吸收 {amount} 点伤害；容量耗尽时魔镜破碎，超出的伤害仍会扣除生命。',{target,amount:amount(p.reflect_amount)}));
        lines.push(t('受到直接攻击时，以普通吸收盾结算后的整次伤害反弹给攻击者，并反向播放原技能。反弹仍受攻击者的护盾和抗性等影响，不会递归反弹，也不会致死。'));
        lines.push(t('持续伤害只消耗魔镜容量，不会反弹。重复施放会叠加剩余容量。'));
        complete=true;
    }
    if(type==='CatchPet'){summary.push(t('捕捉怪物'));lines.push(t('所有存活怪物均可捕捉；成功率受符文、血量、等级和怪物强度影响，成功或失败均消耗一张符文。'));complete=true;}

    // 儿童版特殊效果：按原 Lua 规则展示。
    if(type==='SingleFreeze'){
        summary.push(t('冰封{target}',{target}));
        lines.push(t('冰封期间额外减伤{percent}%，并附加全系护盾；受攻击解除冰封后，防连续冰封保护仍保留。',{percent:dataset.global?.freezeResistPercent??80}));
        lines.push(t('冰封{target}，使其无法行动，直到其受到伤害或 {rounds} 回合后解除。',{target,rounds:p.rounds||2}));
        complete=true;
    }
    if(type==='ConversePositiveWard'){
        const from=wards[p.fromward],to=wards[p.toward];
        summary.push(t('护盾转换为诅咒'));
        lines.push(t('仅转换带品质的对应护盾，按绿、蓝、紫、橙顺序转换一层；基础护盾按原版规则不转换。'));
        if(from&&to)lines.push(t('将{target}身上的「{from}」护盾转换为「{to}」诅咒。',{target,from:t(from.desc||'护盾'),to:t(to.desc||'诅咒')}));
        complete=true;
    }
    if(type==='SingleGuardianWithImmolate'){
        summary.push(t('替身守护'));
        lines.push(t('对自己造成 {amount} 点死亡伤害，为自己或一名非宠物队友附加一次替身守护；倒下后恢复 {hp} 点生命，不超过生命上限。',{amount:range(p.immolate_damage_min,p.immolate_damage_max),hp:dataset.global?.guardianReviveHp??2000}));
        complete=true;
    }
    if(type==='Enrage'){
        summary.push(t('激怒怪物'));
        lines.push(t('激怒 {min}~{max} 级且允许激怒的战斗中怪物，切换原版激怒属性与技能并回满生命；每只限一次，激怒后捕捉更难。',{min:p.can_enrage_minlevel||1,max:p.can_enrage_maxlevel||1}));
        complete=true;
    }
    // 系统 / 过程卡：不出现在玩家卡组
    if(['Dead','PickPet','Fizzle','HoT','DoT'].includes(type)){
        summary.push(t('系统牌'));
        lines.push(t({
            Dead:'系统牌：单位阵亡时由系统使用，不出现在玩家卡组。',
            PickPet:'系统牌：宠物抓取过程，不出现在玩家卡组。',
            Fizzle:'系统牌：表示一次施法失误（MISS）。',
            HoT:'系统模板：持续治疗效果。',
            DoT:'系统模板：持续伤害。',
        }[type]));
        complete=true;
    }
    if(!complete)lines.push(t('此牌的特殊效果说明尚未完整收录，请结合战斗记录查看实际效果。'));
    const variable=card.pipcost==='X'||Number(card.pipcost)<0||Number(card.pipcost)===114;
    if(variable||Object.values(p).some(v=>/\dp(?:,|$)/.test(String(v))))lines.push(t('“×魔力”按本次施法实际计入的魔力点计算，不是固定总量；本系超级魔力每个抵 2 点，其他系抵 1 点。'));
    const fallback=/Ward|Shield|Absorb|Guardian/.test(type)?'护盾效果':/Charm/.test(type)?'增益 / 减益':/Stun|Freeze/.test(type)?'控制行动':/Pip/.test(type)?'改变魔力':/Global|Aura|Stance/.test(type)?'场地 / 姿态':'特殊魔法';
    if(type==='CatchPet')return {summary:summary.join(t('；')),lines,target,
        meta:t('抓宠符文 · 消耗一张 · 成功率随目标变化'),
        note:t('选中符文后查看目标的捕捉成功率；卡牌命中率不代表捕捉成功率。')};
    return {summary:summary.join(t('；'))||t(fallback),lines,target,
        meta:t('{school}系 · {target} · 消耗 {cost} 点魔力 · 冷却 {rounds} 回合 · 基础命中 {accuracy}%',{school:schoolName(card.spellSchool),target,cost:variable?'X':card.pipcost??0,rounds:cooldown??p.cooldown??0,accuracy:Math.min(100,Number(card.accuracy)||0)}),
        note:t('以上为基础效果；实际伤害、治疗与命中受角色属性、目标防御及战斗状态影响。')};
}
