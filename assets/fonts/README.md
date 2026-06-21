# assets/fonts

Fonts used by the AM-4 CJK render gating spike (`npm run spike:cjk`,
`scripts/smoke/cjk-render-spike.ts`).

## NotoSansSC.ttf (NOT committed — git-ignored)

The real **Noto Sans SC** (OFL 1.1), the Simplified-Chinese subset of Noto Sans CJK.
It is a large variable-font binary, so it is git-ignored (`assets/fonts/*.ttf`).
Only this README and `OFL.txt` are committed.

Fetch it before running the spike:

```bash
curl -fL -o assets/fonts/NotoSansSC.ttf \
  "https://github.com/google/fonts/raw/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf"
curl -fL -o assets/fonts/OFL.txt \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt"
```

The spike fails loudly with `BLK-003` if the font is absent or under 1 MB (i.e. an
error page rather than a real font).

## OFL.txt (committed)

The SIL Open Font License 1.1 text for Noto Sans SC. Noto Sans SC is licensed under
OFL 1.1; redistribution of the binary is permitted, but to keep the repo lean we keep
the binary out of git and commit only the license + this note.
