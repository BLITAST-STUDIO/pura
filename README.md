# PURA

散らばる雫を集め、ひとつの核にする。同色は融け合い、混色は純度を削る。

物理演算のコア・パズル。BLITAST STUDIO。

**プレイ:** [blitastxyz.itch.io/pura](https://blitastxyz.itch.io/pura)

## 操作

- ドラッグで雫を掴む
- ダブルタップで分離
- Esc で一時停止
- R でリセット

ステージは 8 本。サンドボックスはエンドレス。

## 開発

```bash
npm install
npm run dev
```

itch.io 用 ZIP:

```bash
npm run pack:itch
```

`artifacts/pura-html.zip` ができます。Uploads で「This file will be played in the browser」にチェック。

`web/` は書き出し済みの静的ファイルです。フォルダをそのまま静的サーバーに置けば遊べます。

## ビルド時の注意

本番 CSS に `.absolute` などが入っていること。Vite の root を変えると Tailwind v4 のソース検出が外れ、canvas が巨大化して真っ暗になる。`src/styles.css` の `@source` を外さない。

```bash
grep -c '\.absolute' dist/game.css   # 0 なら失敗
```
