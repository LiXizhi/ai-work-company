// Capture identity follows the monster's art source. Catalog sheets stay the
// existing pet; an original WebP becomes its own pet with one fixed picture.
import {monsterArtBinding} from './adventure_monster_art_core.js';

const SCHOOLS = ['fire', 'ice', 'storm', 'life', 'death', 'balance'];
const SCHOOL_LABELS = {fire:'烈火', ice:'寒冰', storm:'风暴', life:'生命', death:'死亡', balance:'平衡'};

export function modelPetId(source) {
    const key = String(source || '').replaceAll('\\', '/').toLowerCase().split('#')[0];
    return key ? `model:${key}` : null;
}

export function monsterCaptureSpecies(monster, art) {
    const binding = monsterArtBinding(monster, art);
    if (binding?.kind === 'pet') return {id: binding.petId, static: false};
    if (binding?.kind === 'portrait') {
        const id = modelPetId(monster?.source || monster?.id);
        return id ? {id, static: true, portraitId: binding.id} : null;
    }
    return null;
}

function lessonsFor(monster, content, cards) {
    const keys = [...new Set((monster.pool || []).map(row => row.key).filter(key => cards[key]))];
    if (keys.length) return keys.map((key, index) => ({
        key,
        level: keys.length === 1 ? 1 : Math.min(50, 1 + Math.round(index * 49 / (keys.length - 1))),
        copies: 3,
    }));
    return (content.learn?.[monster.school] || []).filter(row => cards[row.key]).slice(0, 8)
        .map(row => ({key: row.key, level: row.level, copies: row.copies || 3}));
}

export function installModelPets(content, art, cards = {}) {
    if (!content?.pets || !art?.entries) return content;
    for (const monster of Object.values(content.monsters || {})) {
        const species = monsterCaptureSpecies(monster, art);
        if (!species?.static || content.pets[species.id] || !SCHOOLS.includes(monster.school)) continue;
        const entry = art.entries[species.portraitId];
        const lessons = lessonsFor(monster, content, cards);
        if (!entry?.cdn || !lessons.length) continue;
        content.pets[species.id] = {
            id: species.id,
            name: monster.name,
            sourceId: species.id,
            school: monster.school,
            traits: {elementalAttribute: SCHOOL_LABELS[monster.school] || '魔法'},
            unlockLevel: 1,
            staticAppearance: true,
            lessons,
            art: {
                cdn: entry.cdn, local: entry.local, rows: 1, cols: 1,
                width: entry.width, height: entry.height, static: true,
            },
        };
    }
    return content;
}

export function stampCaptureMonster(monster, art, pets) {
    if (!monster || monster.speciesId) return monster;
    const species = monsterCaptureSpecies(monster, art);
    if (!species || !pets?.[species.id]) return monster;
    return {...monster, speciesId: species.id, unlockLevel: monster.unlockLevel ?? 1};
}

export function stampBattleMonsters(monsters, content, dataset) {
    if (!content?.monsterArt) return monsters;
    installModelPets(content, content.monsterArt, dataset?.cards || {});
    return monsters.map(monster => stampCaptureMonster(monster, content.monsterArt, content.pets));
}
