# 常設の試遊プレビュー

融合の試遊URL: https://blitast-studio.github.io/pura/?lab=fusion

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
