# Avatar artwork credits

Source: [hodokoshitsunagu-arch/AINiangAssets](https://github.com/hodokoshitsunagu-arch/AINiangAssets)
at revision `57ed61176dbd67042658b3ee4bbfbc984a06bda2`.

All 135 standalone still images from the source revision are copied into this
repository as WebP files in `../ainiang/`, preserving the source directory layout,
original dimensions, and transparency. See the [asset manifest](../ainiang/manifest.json)
for source paths, dimensions, sizes, and SHA-256 checksums. WebM videos and ZIP
source bundles are outside this still-image import.

The homepage uses smaller WebP derivatives (up to 512 pixels wide):

| Local file | Source path | Character |
| --- | --- | --- |
| claude.webp | 2d/cutouts/Claude-Chibi.png | 圣女果 (Claude) |
| gpt.webp | 2d/cutouts/ChatGPT-Chibi.png | 小龙女 (GPT) |
| gemini.webp | 2d/cutouts/Gemini-Chibi.png | 哈基米 (Gemini) |

Used with permission: on 2026-11-02, the project owner confirmed that these
characters were made by their partner and authorized free use, copying, and
deployment with this website. Only encoding and homepage image dimensions change.
This project-specific permission does not relicense the artwork under MIT.

The static build includes `dist/assets/avatars/` and `dist/assets/ainiang/`.
GitHub Pages publishes both directories through the site's hosting/CDN:
`https://lixizhi.github.io/ai-work-company/assets/ainiang/<manifest path>`.
No image is hotlinked to the source repository.

To regenerate, install Pillow with WebP support in an authoring environment and
run `python scripts/import-ainiang.py /path/to/AINiangAssets` from the repository.
The encoder uses quality 85, method 6, with lossless alpha. The script verifies
every full-size output's dimensions and alpha channel. Pillow is not a runtime
or deployment dependency; the generated WebP files are committed.

The characters are illustrative avatars, not provider endorsements, verified
worker identities, or evidence of model support. The website retains the current
implementation status alongside the target model roster.
