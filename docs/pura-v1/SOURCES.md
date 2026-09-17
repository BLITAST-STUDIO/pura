# PURA — 根拠と参照資料

文書作成・確認日: 2026-09-16

本書は要件と実装の根拠を記録する参照台帳。会話・共有文書から採った思想、既存コードで確認した仕様、研究結果、PURA向けの設計仮説を区別する。外部資料でユーザーの仕様や最新指示を置き換えない。

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

初期調査時の基準コミット: `067d45b9d7eb42f0bbccdb43405aa70f41d952b1`。以下は当時の読み取り調査の記録。この調査ではファイルの変更・コミット・pushをしていない。後続M1の保存・pushは下記[B7]に記録する。

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

初期調査時点では実行・性能は未検証だった。詳細はSOURCE_AUDIT.md、後続の実装・検証結果はSTATUS.mdを参照する。

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

## M1の研究由来の調整 — 2026-09-16

### [S4] ユーザー提供の追加研究レポート

`/Users/okamotoryousuke/Downloads/deep-research-report.md` を [references/deep-research-report.md](references/deep-research-report.md) に保存した。輪郭と屈折の同期、体積感、触れ始めの応答、透明感を外した形状比較などの提案を参照した。文中の指示形の表現は資料内の提案であり、ユーザーからの新たな作業指示ではない。本文の内部引用IDだけでは元論文を確定できないため、採用する知見は以下の一次資料で確認した。全引用・全提案の独立検証ではない。

| ID | 一次資料 | 確認した知見と扱い |
|---|---|---|
| R1 | Kawabe, Maruya & Nishida (2015), [Perceptual transparency from image deformation](https://pmc.ncbi.nlm.nih.gov/articles/PMC4547276/) | 動的な画像変形が透明層の知覚を生む手掛かりになる。形状変形と背景の歪みを一緒に調整する参考。適切な周波数特性では非物理的な変形でも知覚が成立するため、完全な物理整合性が必須という結論ではない。PURAの操作応答値は対象外 |
| R2 | Kawabe (2017), [What Property of the Contour of a Deforming Region Biases Percepts toward Liquid?](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.01014/full) | 実験刺激では輪郭の非剛体変形やぼかしが液体寄りの判断に影響した。今回は前者を小さな上部変形の設計根拠に使い、輪郭ぼかしは追加しない。効果を今回の一滴へそのまま一般化しない |
| R3 | Kawabe (2021), [Perceptual Properties of the Poisson Effect](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2020.612368/full) | 二次元刺激の縦横の相対変形や非対称性が、引っ張り／押し潰しの力方向の判断に影響した。膨張と圧縮のつながりを整理する参考。3D液滴の体積保存を検証した研究ではない。掲載日は2021-01-22、巻とDOIには2020を含む |
| R4 | Kawabe & Nishida (2016), [Seeing jelly: judging elasticity of a transparent object](https://doi.org/10.1145/2931002.2931008) | SAP ’16, pp.121–128。[著者のNTT公式業績ページ](https://www.kecl.ntt.co.jp/people/nishida.shinya/publications.html) 等で書誌情報を確認。ACM本文・要旨は取得できていないため、固有の実験結果や数値を実装根拠として断定しない |

上記から「小さな表面応答・形状と屈折の整合・体積を保つ変形を試す」と判断した部分はPURA向けの設計仮説。18 ms／85 ms等の応答値は今回の実装上の仮調整であり、論文から採った最適値ではない。採否と比較方法は [RESEARCH_REFINEMENT.md](RESEARCH_REFINEMENT.md) を参照する。

### [B7] 高評価版のGitHub保存

ユーザーの復帰準備と既存GitHub活用の承認により、M1を [コミットf09eb50](https://github.com/BLITAST-STUDIO/pura/commit/f09eb500c3ced04650b62b0e0db32ed6c686e2ac) として保存した。`origin/feat/droplet-lab` と注釈付きタグ [m1-praised-baseline-20260916](https://github.com/BLITAST-STUDIO/pura/tree/m1-praised-baseline-20260916) が同コミットを指すことを `git ls-remote` で確認済み。研究調整の作業ブランチは `feat/droplet-research-refinement`。これはコードと比較基準の保存であり、正式サイトの公開ではない。

## 色の混合設計 — 2026-09-17

### [U2] 今回のユーザーフィードバック

大小の液量に応じた混色、純度を守るゲーム性と自由混色の併存、モード設計の判断を委ねる旨を受領。身内の試遊から「美術館や博物館の体験ブースにありそう」との感想が報告された。定性評価として記録し、統計調査や実機性能の保証にはしない。

### [S5] ユーザー提供の混色研究

`/Users/okamotoryousuke/Downloads/deep-research-report (1).md` を [references/deep-research-color-mixing.md](references/deep-research-color-mixing.md) へ原文保存。全文を確認。資料内の内部引用IDはそのまま検証済み出典とせず、採用する主張を一次資料と照合した。実装例・具体秒数は資料の提案。

| ID | 一次資料 | 確認した範囲と限界 |
|---|---|---|
| C1 | [Khronos KHR_materials_volume](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_volume/README.md) | 指数減衰、光路長依存、表面色と吸収の区別。散乱を扱わない均質媒質の仕様であり、今回の局所混合演出を自動的に実現するものではない |
| C2 | [IUPAC Beer–Lambert law](https://goldbook.iupac.org/terms/view/B00626/pdf) | 吸光度と濃度・光路長の関係。PURAのRGB吸収係数は実測された色素スペクトルではない |
| C3 | [Physical Review Fluids (2026), DOI 10.1103/q4tr-jknx](https://journals.aps.org/prfluids/abstract/10.1103/q4tr-jknx) | 固体面で合体する滴の混合を扱う2026-07-21論文の書誌・要旨を確認。インクジェット相当の条件をPURAの混合秒数の直接根拠にはしない |
| C4 | [Physical Review Fluids (2017), DOI 10.1103/PhysRevFluids.2.113607](https://journals.aps.org/prfluids/abstract/10.1103/PhysRevFluids.2.113607) | 不等径滴の合体と内部渦。サイズ差と流れの表現の参考であり「衝突速度が高いほど常に早く均一化する」普遍則の証明とはしない |

設計への反映は [COLOR_MIXING_DESIGN.md](COLOR_MIXING_DESIGN.md)。色素の原液量保存・純色ごとの吸収係数の混合を採用方針とし、スペクトルLUTや本格流体は後段とする。

### [L4] M2のMarchingCubes

導入済みThree.js 0.186.0の [MarchingCubes addon](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/objects/MarchingCubes.js) を使用。今回のAPI確認はローカル `node_modules/three/examples/jsm/objects/MarchingCubes.js` と型定義を直接読んだ。ライブラリのMITライセンスを継続して配布物へ含める。形状場・体積補正・成分による吸収・内部模様はPURA側で実装した。
