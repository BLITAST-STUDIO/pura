# PURA FLOW

透明な水滴をつかみ、滑らせる質感と触り心地を磨く、PURAの昇華版プロジェクトです。現在はM1「触れる一滴」の承認を受け、M2「融合」の試作を進めています。融合の感触は、実際に触ったユーザーの評価を受けて磨きます。

仕様と承認範囲は [要件定義](docs/pura-v1/REQUIREMENTS.md) と [判断記録](docs/pura-v1/DECISIONS.md)、実装・検証結果と現在の描画方式は [開発状態](docs/pura-v1/STATUS.md) を参照してください。

## スマホで試遊

[一粒の実験を開く](https://blitast-studio.github.io/pura/?lab=droplets&feel=refined)

GitHub Pagesで配信しています。開発Macやローカルサーバーの起動は不要です。ネット接続のあるスマホから開けます。更新・復元手順は [HOSTING.md](docs/pura-v1/HOSTING.md) を参照してください。

[融合の実験を開く](https://blitast-studio.github.io/pura/?lab=fusion) — 同色二滴、量比を変えた混色、五滴の連続融合。詳細と現在の近似は [M2_FUSION.md](docs/pura-v1/M2_FUSION.md)。

## ローカル開発

このリポジトリのルートで実行します。

```sh
npm install
npm run dev -- --host 127.0.0.1
```

`package-lock.json` を追加済みです。ロックされた依存を再現して導入する場合は、`npm install` の代わりに `npm ci` を使えます。

- [一滴の実験画面](http://127.0.0.1:8080/?lab=droplets): `?lab=droplets` で開きます。
- [PURAオリジナル](http://127.0.0.1:8080/): 通常の `/` は既存ゲームの入口を維持しています。

ポートが使用中の場合は、Viteが表示するURLに合わせてください。この手順はローカル起動です。スマホ試遊用の外部配信は上記URLを使います。

## 一滴の試し方

- 水滴をつかんで動かし、離して滑らせる。壁での変形と、止まるまでの感触を確認できます。
- シアン・ローズ・アンバーと、スタジオ／自然光を切り替えて見比べます。
- 「屈折を見る」で模様入りの検査盤面に切り替え、水滴越しの歪みを確認します。
- リセットボタンまたは `R` で元の位置へ戻します。`Esc` で一時停止／再開。設定を開いている場合は、先に設定を閉じます。
- 設定の「触り心地」で「今回の調整」／「保存した感触」を比較できます。「形だけを見る」は透明感を外して輪郭と動きを確認する表示です。揺れの抑制、画質、動作情報表示、一時停止も選べます。

比較用URLは `?lab=droplets&feel=refined` / `?lab=droplets&feel=baseline`。不透明表示は `&view=clay` を加えます。好評の旧ビルド一式はGitタグ `m1-praised-baseline-20260916` に保存済みです。復元手順と今回のリサーチ調整は [RESEARCH_REFINEMENT.md](docs/pura-v1/RESEARCH_REFINEMENT.md) を参照してください。

M1は一滴の見た目と操作を評価する試作です。融合・混色・分離はこの実験画面の対象に含まれません。ビジュアルと触り心地の最終判断は、ユーザーの実際の試遊待ちです。

## 検証

```sh
npm run typecheck
npm test
npm run build
```

型検査、対象テスト、配信用ビルドは別々の検証です。ビルド成功だけで画質や実機性能を合格とは扱いません。実施済みの結果と未検証事項は [開発状態](docs/pura-v1/STATUS.md) に記録します。

## PURAオリジナル

散らばる雫を集め、ひとつの核にする。同色は融け合い、混色は純度を削る。

物理演算のコア・パズル。BLITAST STUDIO。

**プレイ:** [blitastxyz.itch.io/pura](https://blitastxyz.itch.io/pura)

### 操作

- ドラッグで雫を掴む
- ダブルタップで分離
- Esc で一時停止
- R でリセット

ステージは 8 本。サンドボックスはエンドレス。

### 配信用ZIP生成

`npm run pack:itch` でビルドし、`artifacts/pura-html.zip` を生成できます。Viteの入口HTML・分割JavaScript・CSS・素材を相対パスのまま収録します。通常入口と `?lab=droplets` の両方を含みます。ZIP生成はローカルで確認済みですが、アップロード・公開は行っていません。

`web/` は書き出し済みの静的ファイルです。フォルダをそのまま静的サーバーに置けば遊べます。

## ビルド時の注意

本番 CSS に `.absolute` などが入っていること。Vite の root を変えると Tailwind v4 のソース検出が外れ、canvas が巨大化して真っ暗になる。`src/styles.css` の `@source` を外さない。

```sh
rg --count '\.absolute' dist --glob '*.css'
```

一致がなければ、CSSの生成内容とTailwindの設定を確認してください。

## 最初の一面

[澄んだ道を遊ぶ](https://blitast-studio.github.io/pura/?play=first) — 三滴のシアンを集め、純度を守って輪へ運ぶ短い課題。時間制限なし、一手戻せます。実装・検証の範囲は [FIRST_SCENE.md](docs/pura-v1/FIRST_SCENE.md)。

## 三つの道

[3面の試遊版を遊ぶ](https://blitast-studio.github.io/pura/?play=chapters) — 純度を守って運ぶ、小さなまま隙間を通す、二色を別々に届ける。面選択とブラウザごとの達成記録付き。[実装・検証範囲](docs/pura-v1/THREE_CHAPTERS.md)。
