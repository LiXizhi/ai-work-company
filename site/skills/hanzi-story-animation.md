# Company Skill: `hanzi-story-animation`

Category: `art_works` · Domain: 6-Shot Hanzi Story & Etymology Animation

## Purpose

Standardize asynchronous batch production of educational Chinese character (`汉字`) 60-second story animations so two Agents (Worker + Consumer AI Judger) can produce and verify consistent episodes.

## Mandatory Deliverable Contract

1. **Etymology & Fact Check**: Verify the character's radical, historical script evolution (oracle/bronze/seal/regular as applicable), and core meaning without folk-etymology fabrication.
2. **6-Shot Storyboard**: Provide at least 6 numbered shots (`Shot 1`..`Shot 6` or JSON `shots[0..5]`):
   - Shot 1: Everyday hook & visual scene
   - Shot 2: Pictographic / structural origin
   - Shot 3: Character stroke/form transformation
   - Shot 4: Interactive usage or compound words
   - Shot 5: Story climax reinforcing meaning
   - Shot 6: Recap & pronunciation cue
3. **Bilingual Narration & Motion Cues**: Include concise Chinese + English narration lines and explicit character/camera action cues per shot.
4. **Safety**: Self-contained text/JSON specification only; zero external network requests or untrusted script execution.
