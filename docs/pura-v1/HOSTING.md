# 常設の試遊プレビュー

三つの道: https://blitast-studio.github.io/pura/?play=chapters

最初の一面: https://blitast-studio.github.io/pura/?play=first

融合の試遊URL: https://blitast-studio.github.io/pura/?lab=fusion

内部の渦の比較: https://blitast-studio.github.io/pura/?lab=fusion&mixing=swirl

一粒の保存比較: https://blitast-studio.github.io/pura/?lab=droplets&feel=refined

GitHub Pages / `BLITAST-STUDIO/pura` / `gh-pages` ブランチのルートを配信。HTTPS有効。Mac・トンネル・ローカルプロセスは不要。通常の `/pura/` は旧ゲームを維持し、新版はクエリ `lab=fusion`、一粒の比較は `lab=droplets` で開く。

## 更新

1. ソースの作業ブランチで変更を確認・コミットし、必要な型検査・テストと `npm run build` を行う。
2. 既存ソースのcheckoutは切り替えず、一時ディレクトリへ `git clone --single-branch --branch gh-pages https://github.com/BLITAST-STUDIO/pura.git` する。
3. **その配信専用clone内だけ**で旧配信ファイルを置換し、新しい `dist/` の中身をルートへコピーする。`.git` は維持する。`.nojekyll` を置き、`build-info.json` に実際のソースcommitを記録する。ソース・環境変数・認証情報はコピーしない。
4. 配信cloneでcommitし、`gh-pages` へ通常pushする。force pushは不要。ソースブランチへのpushだけではプレビューは変わらない。
5. GitHub Pages build完了後、公開indexと全JS/CSSのHTTP成功・ローカルhash一致、ブラウザで描画と操作を確認する。

## 初回配信（2026-09-17）

- ソース: `be10791af9e51bd88ab164bf0dc9981b46dfc1bf`（スマホのスクロール抑止を含む）。
- 配信commit: `c725205e98fd75a44c21ac5a47d3177af91b494f`。
- `base: "./"` により `/pura/` 配下からアセットを取得する。
- 既存の好評版タグ `m1-praised-baseline-20260916` は維持。配信を戻す場合は `gh-pages` の変更をrevertするか、対象ソースを別worktreeでbuildして通常pushする。
- 今回はユーザー依頼による試遊配信。新規有料契約なし。

[GitHub Pages REST API](https://docs.github.com/en/rest/pages/pages)

## M2配信（2026-09-17）

- ソース: `d71e027a0567222a68e004fbf689fb95c3468d03`、配信: `9e7e76a971c53cdddce765b011e2f3f0f6600104`。
- Pages built、全8配信ファイルがHTTP200・ローカルSHA-256一致。公開版390×844で二滴と1:4混色のドラッグ確認、警告・エラー0。実機タッチは未検証。
- 証拠: `artifacts/m2/pages-build.json`、`artifacts/m2/public-browser-check.json`。一粒の入口と旧ゲームの入口も維持。

## 内部の渦の比較配信（2026-09-17）

- ソース: `582f8787784e6de1b1d706ad4db9f5c06294df78`、配信: `2c4af394e5d851a96e93dbdcbb22eef11c2e0f0d`。
- 標準URLは従来表示を継続。`mixing=swirl` を付けたURLは色の混合から開始し、内部の弱い渦を有効にする。設定でも切替可能。
- 戻す基準はタグ `m2-approved-20260917`（d8686f3）。配信を戻す場合の直前commitは `9e7e76a`。
- Pages built、全8ファイルがHTTP200・ローカルSHA-256一致。公開試作URLで融合操作、成分量9248、警告・エラー0を確認。証拠は `artifacts/m2/swirl/pages-build.json` と `public-browser-check.json`。

## 柔らかい膨らみの比較（2026-09-17）

- 試遊: https://blitast-studio.github.io/pura/?lab=fusion&mixing=bloom
- ソース `b8e2ad411620cfede739523b95d6efbf63db192c`、配信 `0d9bca35f028cb1edbe947ccd1d578d1d7c0ef6e`。
- 前の渦は `mixing=swirl` で継続。復元タグ `m2-swirl-v1-20260917`、直前配信 `2c4af39`。
- Pages built、全8ファイルHTTP200・hash一致。公開版の融合操作で成分量維持・警告エラー0。証拠: `artifacts/m2/bloom/pages-build.json` と `public-browser-check.json`。

## 最初の一面（2026-09-17）

- ソース `d9985f6ec5f671363ceaf0f7a07189920e427731`、配信 `5855eb2989ce73725bb75b3f5ce850019011524c`。
- `?play=first` は純度を守って運ぶ一面。M1、M2、bloomの比較入口と旧標準入口は継続。
- 復元点は `m2-bloom-approved-20260917`（38235e5）。直前配信 `0d9bca3`。
- Pages built、全11ファイルHTTP200・ローカルSHA-256一致。公開版の融合と取り消し確認、警告・エラー0。証拠: `artifacts/first-scene/pages-build.json` と `public-browser-check.json`。

## 三つの道（2026-09-17）

- ソース `c54195d9d0944972cfde9c03fc3b24ad2a427f49`、配信 `bd7d161a41b15df529bc606fcd66c8eb4494e10c`。
- Pages built、全11ファイルHTTP200・SHA-256一致、build-info一致。公開版390×844で融合と取り消し、警告・エラー0を確認。証拠: `artifacts/chapters/`。
- 復元タグ `first-scene-approved-20260917`、直前の配信 `5855eb2`。既存比較URLと旧標準入口を保持。

## 壁の手応えと音・振動（2026-09-24）

- ソース `63435a4f5015ec560e459b8735d86adb2c3f0c17`、配信 `c4eee52991bb8a73fd0bdbe9985710822d986e01`。
- 3面・一粒・融合の全入口に音と振動、融合／3面に壁・石の手応えを追加。`?sound=off` で一時的に消音。
- 復元タグ `chapters-approved-20260924`（2443937）、直前の配信 `bd7d161`。
- Pages built、全12ファイルHTTP200・SHA-256一致。公開版をヘッドレスChromeで実操作し警告・エラー0。証拠: `artifacts/sensory/public-*.json`。

## 縁が波打つ柔らかさ（2026-09-24）

- ソース `70ef3f6a9ee06ad75b85e6c1fe8f2daf0bf8e0bf`、配信 `c7c0e7f3dda6e007f3e623e8cedce93238e84459`。
- 比較は `?ripple=on`（一粒・融合・3面）。既定表示は直前の配信 `c4eee52` と静止画で画素差0。
- Pages built、全12ファイルSHA-256一致。公開版をGPU描画のヘッドレスChromeで操作し、3画面とも警告・エラー0。証拠: `artifacts/ripple/public-check.json`。

## 雫の形から床へ届く光（比較用、2026-09-24）

- 試遊: https://blitast-studio.github.io/pura/?play=chapters&chapter=2&caustic=shape 。一粒・融合でも `caustic=shape` を指定できる。指定しない既定表示は承認済みの床光を維持。
- ソース `b054db25a0cbd2591f6786a1b6b85fa737f58928`、配信 `2d7b20cbe64245c12fda297cc3c3943b10ac5aed`。直前の配信は `08d15311825666ecaa861eb61cf6fad6ec676257`。復元基準は `sensory-approved-20260924`（de17058）。
- Pages built、全11ファイルHTTP200・ローカルSHA-256一致。公開版の一粒と第2面で描画・警告エラー0を確認。証拠: `artifacts/shape-caustic/deployment.json`、`pages-build.json`、`http-check.json`、`public-check.json`。実機タッチ・端末GPU負荷は未検証。

## 入口プレイ（2026-09-25）

- ソース `512594d`、配信 `22da96b`。試遊 `?play=open`。既存の入口は変更なし（3面の下部に入口プレイへのリンクを追加）。
- Pages built、全13ファイルSHA-256一致。公開版をGPU描画のヘッドレスChrome（390×844）で操作し、融合・反発・音・60 fps・警告エラー0。証拠 `artifacts/open-play/public-check.json`。

## 分離のしぶき（2026-09-25）

- ソース `0d6f039`、配信 `2714969`。全ファイルSHA-256一致。
- 承認版（しぶき追加前）の保存点: タグ `open-play-approved-20260925`（7c86698）、直前の配信 `22da96b`。


## 見た目の既定化（2026-09-25）

- ソース `6673359`、配信 `1f3e4c8`。全ファイルSHA-256一致。縁の波と形からの床光が既定。旧表示は `?ripple=off&caustic=artistic`。

## クラッシュ修正（2026-09-25）

- ソース `ac10d7a`、配信 `fb43b4e`。連続融合で描画が止まる不具合の修正を含む。全ファイルSHA-256一致。
