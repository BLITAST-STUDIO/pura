# PURA — 根拠と参照資料

文書作成・確認日: 2026-09-16

本書は製品の要件定義。会話・共有文書から採った思想、既存コードで確認した仕様、新しく具体化した初期案を区別する。Web確認は技術機能とCodexの運用に限定し、外部事例でユーザーの仕様を置き換えていない。

## ユーザー資料

### [U1] この会話での要望と合意

水滴に近い透明でカラフルな物質、屈折・色・質感、指で弾く滑走と同色連続吸収、シンプルなルール、ビジュアル・感覚の重視、Codexを主な開発ツールにすること。ユーザーが提示した最新版の概要は純度・混色・条件付き分離・8面を持つ版。

会話中の助手の提案を、全て個別承認済みとは扱っていない。Web先行、12個の入口、音OFF、数値目標等は文書内で初期案・暫定目標とした。

### [S1] PURAの強み.txt

元のUTF-8ファイルを `references/PURAの強み.txt` へそのままコピーした。ゲームより先に現象へ参加する、触る→融合→繰り返す、ゲームとデジタルトイの中間、即触れる入口、説明より発見、動画の続きを触るという構想の根拠。

同文書の加速・一時磁力は例示として保存し、採用済みのゲームルールにはしない。他ゲームの流行理由などの市場分析を今回独立検証したわけではなく、それをPURAの成功の根拠に使っていない。

### [S2] 旧PURA_DEVELOPMENT_KIT.zip

この会話で作成・提供済みの準備版0.1。PRODUCT、TECH_PLAN、MILESTONES、VALIDATION、BASELINE_AUDIT、DECISIONS等を読み取り、既存版保護・M0〜M4・初期技術案を継承した。今回の正本は `docs/pura-v1/REQUIREMENTS.md`。

旧キットをGitHubへ追加済みか、既に実装が進んでいるかは今回確認していない。ローカルで実際の状態を確認する。

### [S3] 生成コンセプト画像

`references/visual-target.png`。会話で生成されユーザーから好意的に評価された画像の元ファイルをコピーした。元名: `a_high_end_cinematic_glossy_3d_rendered_scene_a.png`。画像は実際のゲームのスクリーンショットではない。

元画像の光と質感を参考にする。低い撮影位置、ボケ、文字、全ての飛沫や床の濡れを実装条件とはしていない。バイナリのSHA-256はルートのMANIFEST.json参照。

## GitHubの直接確認

基準コミット: `067d45b9d7eb42f0bbccdb43405aa70f41d952b1`。以下は読み取りのみ。ファイルの変更・コミット・pushはしていない。

- [B0] 取得時のデフォルトブランチHEAD確認  
  `https://api.github.com/repos/BLITAST-STUDIO/pura/commits?per_page=1`
- [B1] package.json  
  `https://github.com/BLITAST-STUDIO/pura/blob/067d45b9d7eb42f0bbccdb43405aa70f41d952b1/package.json`
- [B2] src/game/sim.ts — 先頭側と335〜680行の読み取りを組み合わせて主要ルール・融合・核判定を確認。末尾の全コードを再精査したという主張ではない  
  `https://github.com/BLITAST-STUDIO/pura/blob/067d45b9d7eb42f0bbccdb43405aa70f41d952b1/src/game/sim.ts`
- [B3] src/game/palette.ts  
  `https://github.com/BLITAST-STUDIO/pura/blob/067d45b9d7eb42f0bbccdb43405aa70f41d952b1/src/game/palette.ts`
- [B4] src/game/levels.ts  
  `https://github.com/BLITAST-STUDIO/pura/blob/067d45b9d7eb42f0bbccdb43405aa70f41d952b1/src/game/levels.ts`
- [B5] src/game/renderer.ts — 1〜120行を今回確認  
  `https://github.com/BLITAST-STUDIO/pura/blob/067d45b9d7eb42f0bbccdb43405aa70f41d952b1/src/game/renderer.ts`
- [B6] ツリー  
  `https://api.github.com/repos/BLITAST-STUDIO/pura/git/trees/89197a8ba914c43f09a7948bae8da47614f8329b?recursive=1`

実行・性能は未検証。保存・音・入力画面の詳細等はM0で改めて確認する。詳しくはSOURCE_AUDIT.md参照。

## 公式技術文書

- [T1] Three.js MeshPhysicalMaterial — 透過、IOR、厚み、吸収などの機能。PURAの融合形状や内部光路を自動的に実装するものとは扱わない  
  `https://threejs.org/docs/pages/MeshPhysicalMaterial.html`
- [O1] OpenAI — Custom instructions with AGENTS.md。指示の読込、階層、参照の運用  
  `https://developers.openai.com/codex/agent-configuration/agents-md`
- [O2] OpenAI — Best practices。複雑な作業の計画、短く実用的なAGENTS、実装・検証の運用  
  `https://developers.openai.com/codex/learn/best-practices`

上記は機能の存在と運用方法の裏付け。将来の版や全端末互換性、特定画質・FPS、AIが必ず完成できることの保証ではない。利用するライブラリとCodexの具体的な版・機能は、実装時の環境で確認する。

## M1開発で追加した依存と制作物

2026-09-16、ローカルの `package.json`、`package-lock.json`、インストールされた各パッケージの `package.json` と `LICENSE` を確認。以下は今回追加した依存の記録であり、既存・間接依存全体の一覧ではない。

| ID | 依存・版 | 用途 | 出典・ライセンス確認先 |
|---|---|---|---|
| L1 | `three` 0.186.0 | M1のWebGL2描画・シーンと材質の基盤 | [Three.js公式リポジトリ](https://github.com/mrdoob/three.js)。MIT、`node_modules/three/LICENSE` |
| L2 | `@types/three` 0.186.0 | Three.jsのTypeScript型定義 | [DefinitelyTyped / three](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/three)。MIT、`node_modules/@types/three/LICENSE` |
| L3 | `tsx` 4.23.13 | `node --import tsx --test` でTypeScriptの対象テストを実行 | [tsx公式リポジトリ](https://github.com/privatenumber/tsx)。MIT、`node_modules/tsx/LICENSE` |

版は `package-lock.json` に記録して再現する。MITのライセンス文と著作権表示は配布時も保持する。

### [A1] 手続き的に生成する盤面・照明

M1の通常盤面・屈折検査盤面のテクスチャと環境照明の形状は、このプロジェクトのコードで独自に生成する。水滴・床・環境照明用の外部画像、HDRI、3Dモデルは追加していない。`references/visual-target.png` は資料としての美術参照であり、ゲーム背景として使用していない。

### [T2] 光学式の参照

[Physically Based Rendering 第4版 — Specular Reflection and Transmission](https://pbr-book.org/4ed/Reflection_Models/Specular_Reflection_and_Transmission)。屈折率、Snellの法則、Fresnel反射と透過の式を、M1の光学表現を検討する際の根拠として参照した。

[T1のThree.js MeshPhysicalMaterial公式資料](https://threejs.org/docs/pages/MeshPhysicalMaterial.html) も、透過・厚み・吸収・環境照明の確認に使用。参照式やライブラリの機能が、そのままPURAの全光路を正しく再現することを意味しない。最終的に採用した描画方式、近似の範囲、画面比較と検証結果は `STATUS.md` に記録する。
