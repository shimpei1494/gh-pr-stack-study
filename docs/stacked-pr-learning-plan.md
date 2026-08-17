# GitHub スタック PR 学習・検証計画

最終更新: 2026-08-18

## この検証の目的

少量のコードを使い、GitHub のスタックされたプルリクエスト（以下、スタック PR）が実務で何を解決するかを体験する。

特に、次の疑問に答えられる状態をゴールとする。

1. 下位の PR にレビュー指摘が入り修正したとき、上位の PR はどうなるか。
2. 最初からスタックにする必要があるか。
3. 通常の PR を作った後、レビュー待ちの間にその上へ PR を追加できるか。
4. レビュアーには各 PR の差分がどう見えるか。
5. 下位から一部だけマージしたとき、残りの PR とブランチはどうなるか。
6. CI、承認、レビューコメントはリベース後にどう変化するか。

## 先に結論

- スタック PR は、依存する大きな変更を、順序のある小さな PR に分ける仕組みである。
- 最下位の PR は `main` などを base にし、それより上の PR は一つ下の PR のブランチを base にする。
- 各 PR には原則として、その層で追加した差分だけが表示される。
- 最初からスタックとして作る必要はない。既存ブランチは `gh stack init` で採用でき、既存 PR は `gh stack link` で後から GitHub 上のスタックへリンクできる。
- 通常の PR がレビュー待ちになってから、そのブランチ上に次のブランチを作ってスタックを伸ばせる。これはスタック PR の代表的な用途である。
- 下位 PR を修正しても、上位ブランチのコミット履歴が自動的にローカルで書き換わるわけではない。公式手順では、修正した層から `gh stack rebase --upstack` を実行し、続けて `gh stack push` する。
- GitHub Web のサーバー側カスケードリベースも利用できる。ただし、そこで生成されたコミットは署名されない。
- マージは下から順に行う。途中まで、または最上位までをまとめてマージできる。下位をマージすると、GitHub は残りの PR を自動的にリベース／再ターゲットする。
- 2026-08-18 現在、この機能はパブリックプレビューであり、仕様や CLI の挙動は変わる可能性がある。

## 従来の「数珠つなぎ PR」とネイティブなスタック PR の違い

ブランチの base を次のように設定するだけでも、以前から小さな依存 PR は作れた。

```text
main
└── feat/model       PR #1: base main
    └── feat/cli     PR #2: base feat/model
        └── feat/test PR #3: base feat/cli
```

しかし、これだけでは GitHub は複数 PR を一つの管理単位として扱わない。GitHub のネイティブなスタックとしてリンクすると、次が追加される。

- GitHub UI にスタック全体の順序と各 PR の状態が表示される。
- `gh stack` がブランチ作成、移動、submit、カスケードリベース、push をまとめて扱う。
- スタックの一部または全体を、依存順序を保ってマージできる。
- 下位 PR の base ブランチに設定された保護ルールや CI 要件が、スタック内の各 PR に適用される。
- REST API、GraphQL、Webhook からスタック情報を扱える。

## 最小教材の設計

言語は Node.js の標準機能だけを使い、外部パッケージは追加しない。コードそのものではなく、コミット、ブランチ、PR の関係に集中する。

最終的なファイル数は、初期設定を含めて 5 個程度に抑える。

```text
package.json
src/greeting.js
src/cli.js
test/greeting.test.js
.github/workflows/test.yml
```

各層の役割は次の通り。

| 層 | ブランチ | 内容 | 依存関係 |
|---|---|---|---|
| trunk | `main` | `package.json` と最小 CI | なし |
| PR #1 | `feat/greeting` | `greet(name)` を追加 | `main` |
| PR #2 | `feat/cli` | CLI から `greet(name)` を利用 | PR #1 |
| PR #3 | `feat/test` | greeting/CLI のテストを追加 | PR #2 |

PR #1 のレビュー修正では、`greet(name)` を `greet({ name })` に変更する。この変更により PR #2 と PR #3 が下位層の古い API に依存した状態になり、カスケードリベースと追加修正の必要性を観察しやすい。

## 前提条件

- GitHub 上に、このディレクトリを push できる検証用リポジトリがあること。
- スタック内の全ブランチが同じリポジトリにあること。クロスフォークのスタックはサポートされない。
- GitHub CLI 2.90.0 以降と Git 2.20 以降を利用すること。
- `gh auth login` が完了していること。
- GitHub Desktop ではなく、GitHub CLI または Web UI を使うこと。
- パブリックプレビュー機能が対象リポジトリで利用可能であること。`gh stack` の終了コード 9 は、そのリポジトリでスタック PR が有効でないことを示す。

準備時に確認する。

```bash
gh --version
git --version
gh auth status
gh extension install github/gh-stack
gh extension list
```

## 実験 0: 通常の PR とスタック PR の基準を作る

### 手順

1. `main` に最小の `package.json` と CI を追加する。
2. `feat/greeting` を通常の Git ブランチとして作る。
3. `src/greeting.js` を追加して push する。
4. `gh pr create --base main --head feat/greeting` で、まずは通常の PR #1 を作る。

### 観察すること

- この時点では PR #1 は単独の PR として表示されるか。
- PR 画面にスタックアイコンやスタックマップがないこと。
- CI が通常どおり動作すること。

### この実験で答える疑問

最初の PR は、スタックを意識せず通常どおり作成できる。

## 実験 1: レビュー待ちの通常 PR を後からスタック化する

この実験が「PR を作った後、レビューが遅ければ上に追加できるか」への直接の回答になる。

### 手順 A: 既存 PR を明示的にリンクする方法

1. PR #1 のブランチから `feat/cli` を作る。
2. `src/cli.js` を追加してコミットする。
3. PR #1 と新しいブランチを、下から上の順でリンクする。

```bash
git switch feat/greeting
git switch -c feat/cli
# src/cli.js を追加して commit
gh stack link 1 feat/cli
```

`1` は実際の PR 番号に置き換える。`gh stack link` はブランチを push し、必要な PR を作り、既存 PR の base が期待するチェーンと違えば修正する。

### 手順 B: ローカル管理も `gh stack` に任せる方法

既存ブランチを採用してローカルスタックを初期化することもできる。

```bash
git switch feat/greeting
gh stack init feat/greeting
gh stack add feat/cli
# src/cli.js を追加して commit
gh stack submit
```

実験では A を先に行い、「既存 PR からでも後付けできる」ことをはっきり確認する。その後、必要なら `gh stack checkout <PR番号>` でリモートスタックをローカルへ取り込む。

### 観察すること

- PR #1 の内容や URL が維持されたまま、スタックに参加するか。
- PR #2 の base が `feat/greeting` になるか。
- PR #2 の Files changed に、PR #1 の差分が重複せず、`src/cli.js` の変更だけが見えるか。
- GitHub UI の上部とマージ欄に、PR #1 と PR #2 のスタックマップが出るか。
- `gh stack view` に両方のブランチと PR が正しい順序で出るか。

### 期待結果

最初からスタックにする必要はない。通常 PR のレビュー待ち中に、そのブランチを土台として次の作業を進め、後からネイティブなスタックへ変換できる。

## 実験 2: 3 層目を追加する

### 手順

```bash
gh stack top
gh stack add feat/test
# test/greeting.test.js を追加して commit
gh stack submit
gh stack view
```

### 観察すること

- PR #3 の base が `feat/cli` になるか。
- PR #3 の差分がテスト追加だけになるか。
- PR #1、#2、#3 のすべてで CI が実行されるか。
- 3 層を GitHub UI で上下に移動できるか。

### 期待結果

未マージの作業に依存する次の変更を、レビュー完了を待たずに開始できる。一方で、互いに依存しない変更まで同じスタックに積む必要はない。独立した変更は `main` から別ブランチを作る方が、マージ順序の制約が少ない。

## 実験 3: 最下位 PR のレビュー指摘を修正する

### 想定レビュー指摘

PR #1 に「引数を将来拡張できるよう、`greet(name)` を `greet({ name })` に変更してほしい」という指摘が入ったとする。

### 手順

```bash
gh stack bottom
# src/greeting.js を修正
git add src/greeting.js
git commit -m "refactor: accept greeting options"
gh stack rebase --upstack
gh stack push
gh stack top
```

リベース中に上位層で競合した場合は、競合を直して次のように続行する。

```bash
git add <解決したファイル>
gh stack rebase --continue
gh stack push
```

すべてを取り消す場合は `gh stack rebase --abort` を使う。

### 観察すること

- リベース前、PR #2/#3 は下位ブランチの新しいコミットを祖先に持っていないこと。
- `gh stack rebase --upstack` が PR #2、#3 のコミットを新しい PR #1 の上へ順に積み直すこと。
- リベースにより PR #2、#3 のコミット SHA が変わること。
- push が `--force-with-lease` 相当で行われること。
- PR #2 の CLI 呼び出しが古い API のままなら、競合またはテスト失敗として検出されるか。
- push 後も各 PR の差分が各層だけに保たれるか。
- CI が再実行されるか。
- 古いコミット上のレビューコメントが outdated 表示になるか。
- ブランチ保護で「新しいコミット時に承認を取り消す」を有効にした場合、承認が外れるか。

### 期待結果

下位 PR の修正は上位 PR に影響する。`gh stack` はコミットを依存順に積み直す作業を自動化するが、API 変更に伴う上位コードの意味的な修正や競合解消までは開発者が判断する必要がある。

Zenn 記事では `gh stack sync` によって下位変更が上位へ反映された実測例も紹介されている。一方、GitHub の管理手順はこの用途に `gh stack rebase --upstack` と `gh stack push` を明示しているため、この検証では公式手順を基準とする。`sync` の挙動比較は追加実験に回す。

## 実験 4: `sync` と明示的な `rebase --upstack` を比較する

### 目的

`gh stack sync` が「fetch、trunk 更新、rebase、push、PR 状態同期」をまとめる便利コマンドであることと、下位層を修正した直後の意図が明確な操作との差を確認する。

### 手順

1. PR #1 に無害なコミットを一つ追加する。
2. `main` のリモート SHA が変わっていないことを控える。
3. `gh stack sync` を実行する。
4. PR #2/#3 の SHA、内容、push 結果を確認する。
5. 同じ種類の変更を別コミットで再現し、今度は `gh stack rebase --upstack` と `gh stack push` を使う。

### 観察すること

- 現在の拡張機能で、`main` が動いていなくても `sync` が上位をリベースするか。
- 両手順で結果に差があるか。
- ログから、それぞれが行った fetch、rebase、push、PR 同期の範囲が分かるか。

### 判断基準

- 下位修正を確実に上へ伝える意図を明示したいときは `rebase --upstack` + `push`。
- マージ後の cleanup や、リモートとローカルの状態をまとめて合わせたいときは `sync --prune`。
- パブリックプレビュー中は、実測結果と利用中の `gh-stack` バージョンを記録する。

## 実験 5: 下位だけを先にマージする

### 手順

1. PR #1 だけをマージする。
2. GitHub UI で PR #2/#3 の base と状態を見る。
3. ローカルで同期する。

```bash
gh stack sync --prune
gh stack view
```

### 観察すること

- PR #2 が `main` を対象とするよう自動的に更新されるか。
- PR #3 は引き続き PR #2 を base にするか。
- マージ済みの PR #1 がスタック表示でどう見えるか。
- `--prune` により PR #1 のローカルブランチが削除されるか。
- PR #2 の差分に PR #1 の変更が混ざらないか。

### 期待結果

スタック全体のレビュー完了を待たず、準備ができた下位の層からマージできる。残りは新しい土台へ自動的に付け替えられる。

## 実験 6: 途中まで／全体をまとめてマージする

### 手順

- PR #2 までマージする場合は、`gh stack merge <PR #2 の番号>` を使う。
- 最上位まで全て準備できた場合は、`gh stack merge` を使って対象と方式を対話的に選ぶ。

### 観察すること

- 選択した PR より下の PR も一緒にマージされるか。
- 上に残った PR があれば、base が自動的に更新されるか。
- merge、squash、rebase の各方式で、最終的な履歴が下から個別にマージした場合と同じ形になるか。
- 一つでもマージ要件を満たさない PR がある場合、まとめたマージ全体が止まるか。

### 注意

スタックでは依存順序を逆転して上位だけを先にマージする考え方はしない。上位を選んでマージする操作は、その下にある層も含めてマージする操作になる。

## 実験 7: スタック構造を後から変える

余力があれば、`gh stack modify` で次を試す。

- 途中に空の層を挿入する。
- PR #2 と #3 を並べ替える。
- 小さすぎる二つの層を一つにまとめる。
- ブランチ名を変更する。
- 変更を `gh stack submit` で GitHub に反映する。

依存関係が本当にその順番で成立するかを確認する。単に操作できることよりも、「並べ替えてもコードが意味的に成立するか」が重要である。

## 実務で便利な場面

- DB スキーマ → Repository → API → UI のように依存順序が明確な変更。
- リファクタリング → 振る舞い変更 → テスト追加のように、レビュー観点を分けたい変更。
- 大きな変更の最初の部分をレビューに出しつつ、承認待ちの時間に次を進めたい場合。
- AI が生成した大きな差分を、意味のある小さなレビュー単位へ分けたい場合。
- 基盤部分だけ先にマージし、上位の製品機能は引き続きレビューしたい場合。

## 向かない場面・コスト

- 互いに独立しており、好きな順でマージしたい変更。
- 数行で完結し、一つの PR の方がレビューしやすい変更。
- 下位層の設計が頻繁に大きく変わり、上位すべてで競合が起きやすい段階。
- fork からのコントリビューション。クロスフォークスタックはサポートされない。
- force push やリベースを禁止する運用と強く衝突するリポジトリ。
- 各層に CI が走るため、実行時間や利用料金が問題になるリポジトリ。

実務では 2〜5 層程度から始め、各 PR を単独で説明・レビューできる大きさにするのが扱いやすい。スタックを深くすること自体を目的にしない。

## 検証時の記録テンプレート

各実験で次を残す。

```markdown
### 実験 N

- 実施日:
- gh version:
- gh-stack version:
- stack / PR URL:
- 実行前の `gh stack view`:
- 実行コマンド:
- 実行後の `gh stack view`:
- GitHub UI で見えた差分:
- CI / 承認 / コメントの変化:
- 期待結果との差:
- 実務で使えそうか:
```

## 完了条件

- 3 層のスタックが GitHub UI で確認できる。
- 各 PR の差分がその層だけに限定されていることを説明できる。
- 通常 PR を後からスタックへ追加できることを実証できる。
- 下位 PR の変更を上位へカスケードリベースし、競合またはテスト失敗を観察できる。
- 下位だけのマージ後に、残りの PR がどう変わるか説明できる。
- スタックを使う場合と、独立 PR にする場合の判断基準を自分の言葉で説明できる。

## 参考資料

- [GitHub Docs: スタックされたプルリクエストについて](https://docs.github.com/ja/pull-requests/get-started/about-stacked-prs)
- [GitHub Docs: スタックプル要求のクイックスタート](https://docs.github.com/ja/pull-requests/get-started/stacked-prs-quickstart)
- [GitHub Docs: スタックされたプル要求の管理](https://docs.github.com/ja/pull-requests/how-tos/create-pull-requests/managing-stacked-pull-requests)
- [GitHub Docs: Stacked pull requests CLI コマンド](https://docs.github.com/ja/pull-requests/reference/stacked-prs-cli-commands)
- [Zenn: GitHubにスタック型プルリクエストが登場。gh stackでPRを分割して積み上げよう](https://zenn.dev/ubie_dev/articles/gh-stack-introduction)

