# BGM「The White Basin」の利用条件: Googleの規約の確認（2026-10-17、取得は Claude Code）

目的: Gemini（Google AI Pro）で生成したBGMをゲームに組み込み、公開・販売してよいかの根拠。**原文の引用と出典を分け、確認できなかったことを明記する。** 規約は変わるので、公開直前に再確認する。

## 一次資料（Google公式ページ。取得日 2026-10-17）

### Google 利用規約（日本語版） https://policies.google.com/terms?hl=ja　発効日: 2026年7月30日
- 「Google の一部のサービスは、ユーザーによるオリジナル コンテンツの生成を許可しています。Google がそのコンテンツに対する所有権を主張することはありません。コンテンツの中には、一部のユーザーには適していないものが含まれる可能性があります。」
- 禁止（不正な使用）: 「生成 AI のコンテンツを人間が作成したものであると誤解させる行為」
- 禁止: 「機械学習モデルまたは関連する AI テクノロジーの開発を目的とした、Google サービスの AI 生成コンテンツの使用」
- 英語版の同趣旨: "Your content remains yours"（自分のコンテンツの知的財産権は保持される）。
- 規約の中に、生成物の**商用利用を禁じる文言は見つからなかった**。逆に「商用利用してよい」と明記する文言も、この規約では見つからなかった。

### 生成AIの使用禁止に関するポリシー https://policies.google.com/terms/generative-ai/use-policy　最終更新: 2024年12月17日
- 4.5: "Misrepresenting the provenance of generated content by claiming it was created solely by a human, in order to deceive."（だます目的で、生成物を人間だけが作ったと偽ること）
- 商用利用を制限する文言は見つからなかった。

### 生成AIの追加利用規約 https://policies.google.com/terms/generative-ai　最終更新: 2023年8月9日
- **2024年5月22日以降は適用されない**（通常のGoogle利用規約が生成AIを扱う）。Gemini本人の回答はこのページを根拠にしていたため、一部が古い。上の利用規約が現行の根拠。

## 二次資料（参考。根拠にしない）
- Apache Software Foundation の審査メモ（草案、https://apache.org/legal/generative-tooling-terms-reviewed.html 、2026-08-14審査）: Geminiの消費者向けアプリでは、無料版と有料版（Advanced）は出力の扱いが同じで、有料の追加条項は支払いの仕組みだけで出力の権利を変えない。出力は「ユーザーのもの、Googleは所有権を主張しない」。商用利用は同メモに明記なし。
- Gemini API規約（https://ai.google.dev/gemini-api/terms 、2026-03-23発効）は "Google won't claim ownership over that content." 。API向けで、今回の生成方法（アプリ）には直接は当たらない。

## 確認できなかったこと
- **Geminiアプリ専用の規約ページの原文**は取得できなかった（Google AI Pro の条件も同様）。上のGoogle利用規約が全サービスに共通で適用される前提で整理したが、アプリ専用の追加条項は未確認。
- 「商用利用してよい」と書かれた条文は、確認できた範囲にない。「所有権を主張しない」「商用を禁じる文言なし」までが、確認できたこと。

## 判断（Claude Code）
- 確認できた規約の範囲では、Googleは生成物の所有権を主張せず、商用利用や組み込みを禁じていない。身内版・無料公開・BGMとしての同梱は、**禁止条項に当たらない**と見られる。
- 注意点: ① AI生成と明示し、「人間だけが作った」と偽らない。② 純粋なAI生成物は著作権が認められにくく、曲そのものに排他的な権利は主張しにくい（Gemini回答・複数の資料が一致）。③ 既存音源との偶発的な類似について、Googleは保証しない。④ アプリ専用条項は未確認。
- 公開時のクレジット案: `Music: "The White Basin" (Generated with Google Gemini)`。
- 有料販売（完全版）に含める前に、④の確認と、必要なら専門家（弁理士・弁護士）への相談を勧める。
