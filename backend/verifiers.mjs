// Deterministic, zero-execution structural preflight checks for standardized Company Skills.
// Complements verifyWorkerDeliverable's security threat scan before Consumer AI Judging.

export function verifyDeliverableStructure({ category = 'general_files', skill_id = '', result = '' } = {}) {
  const text = String(result || '').trim();
  const passed = [];
  const failed = [];
  const check = (name, ok) => {
    if (ok) passed.push(name);
    else failed.push(name);
  };

  check('non_empty_result', text.length > 0);
  if (!text.length) {
    return { valid: false, category, skill_id, checks_passed: passed, checks_failed: failed };
  }

  switch (skill_id) {
    case 'threejs-procedural-art':
      check('minimum_scene_length', text.length >= 40);
      check('threejs_constructs', /\b(?:THREE|Scene|BufferGeometry|Mesh|PerspectiveCamera|OrthographicCamera)\b/.test(text));
      check('render_or_animation_loop', /\b(?:requestAnimationFrame|render\s*\()\b/.test(text));
      break;

    case 'threejs-shader-animation':
      check('minimum_shader_length', text.length >= 60);
      check('shader_or_glsl_constructs', /\b(?:ShaderMaterial|RawShaderMaterial|gl_Position|gl_FragColor|uniform)\b/.test(text));
      check('time_animation_signal', /\b(?:requestAnimationFrame|uTime|u_time|time|clock)\b/i.test(text));
      break;

    case 'minigame-single-shot':
    case 'threejs-arcade-game':
      check('minimum_game_length', text.length >= 80);
      check('interactive_input_binding', /\b(?:addEventListener|onkeydown|onpointerdown|keydown|pointerdown|click)\b/i.test(text));
      check('score_or_game_state', /\b(?:score|state|gameOver|game_over|restart|playing)\b/i.test(text));
      break;

    case 'poly-code3d-art':
      check('minimum_code3d_length', text.length >= 80);
      check('modular_part_functions', (text.match(/\b(?:function\s+[A-Za-z0-9_]+|const\s+[A-Za-z0-9_]+\s*=\s*\(|local\s+function\s+[A-Za-z0-9_]+|def\s+[A-Za-z0-9_]+)/g) || []).length >= 2);
      check('parameter_map_documented', /(?:参数|parameter|params|尺寸|配色|scale|color)/i.test(text));
      check('printability_checklist', /(?:壁厚|悬空|打印|checklist|thickness|overhang|manifold)/i.test(text));
      break;

    case 'hanzi-story-animation': {
      let shotCount = 0;
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed?.shots)) shotCount = parsed.shots.length;
      } catch {}
      if (!shotCount) {
        const matches = text.match(/(?:分镜\s*[1-9]|镜头\s*[1-9]|Shot\s*[1-9]|^\s*[1-6][.)、])/gim) || [];
        shotCount = matches.length;
      }
      check('six_shot_storyboard', shotCount >= 6);
      check('narration_included', /(?:旁白|narration|voiceover|台词)/i.test(text));
      check('etymology_or_fact_check', /(?:字源|本义|核对|象形|会意|形声|etymology|fact_check)/i.test(text));
      break;
    }

    case 'lifestory-history-scene':
      check('era_year_anchor', /\b(?:19\d{2}|20[0-2]\d)\b/.test(text));
      check('daily_life_scene_layers', /(?:前景|中景|远景|foreground|midground|background|街巷|日常|场景)/i.test(text));
      check('elder_interview_prompts', (text.match(/[?？]/g) || []).length >= 3 || /(?:提问|追问|时光记者|interview_prompts)/i.test(text));
      break;

    case 'second-brain-doc-audit':
      check('source_file_citations', /(?:input\/|[A-Za-z0-9_.-]+\.(?:md|txt|csv|json)(?:#L\d+|:\d+)?|出处|引用)/i.test(text));
      check('contradiction_and_missing_sections', /(?:矛盾|冲突|不一致|contradiction|conflict)/i.test(text) && /(?:缺失|待补|未知|missing)/i.test(text));
      break;

    case 'reverse-cleanroom-spec':
      check('specification_section', /(?:状态机|协议|结构|不变量|specification|state\s*machine|invariant|format)/i.test(text));
      check('deterministic_test_vectors', /(?:测试向量|用例|vector|expected|input.*output)/is.test(text));
      break;

    default:
      break;
  }

  return {
    valid: failed.length === 0,
    category,
    skill_id,
    checks_passed: passed,
    checks_failed: failed,
  };
}
