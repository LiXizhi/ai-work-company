// Shared cosmetic persona presentation for the World page and Sprite Lab.
// Artwork appearance is never model identity attestation.
export const personaPortraits = {
  astra: 'assets/avatars/gpt.webp',
  claude: 'assets/avatars/claude.webp',
  deepseek: 'assets/ainiang/2d/fullbody/deepseek-chibi.webp',
  gemini: 'assets/avatars/gemini.webp',
};

export const personaLabel = {
  astra: 'GPT · OPENAI',
  claude: 'CLAUDE · ANTHROPIC',
  deepseek: 'DEEPSEEK',
  gemini: 'GEMINI · GOOGLE',
};

export function applyPersonaPortrait(el, persona, position = 'center') {
  el.style.backgroundImage = `url("${personaPortraits[persona] || personaPortraits.astra}")`;
  el.style.backgroundSize = 'contain';
  el.style.backgroundPosition = position;
  el.style.backgroundRepeat = 'no-repeat';
}
