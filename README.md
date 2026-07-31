# Audio Key Analyzer - Chrome Extension

Chrome 拡張機能として再生中音声を録音し、[Essentia.js](https://mtg.github.io/essentia.js/) を使ってキーとBPMを推定します。

- [Chrome ウェブストア](https://chromewebstore.google.com/detail/lfcaafpepmhjbiiiglahjdameobdjdch)
- [プライバシーポリシー](PRIVACY.md)

## ファイル構成

- [popup.html](popup.html) / [popup.js](popup.js): ユーザーが録音開始・結果確認を行う UI と、録音・進捗表示・結果受信ロジックを提供。
- [audio-processor.js](audio-processor.js): `AudioWorkletProcessor` として音声チャンクを収集し、[`popup.js`](popup.js) に送信。
- [background.js](background.js): Popup から受け取った音声データを保持し、オフスクリーン文書とサンドボックス iframe を初期化して解析を委譲、結果を Popup に返却。
- [offscreen.html](offscreen.html) / [offscreen.js](offscreen.js): バックグラウンド専用のオフスクリーン文書。Sandbox iframe を生成し、`chrome.runtime` 経由でメッセージを中継。
- [sandbox.html](sandbox.html) / [sandbox.js](sandbox.js): Essentia WASM を読み込み、`parent.postMessage` で [`offscreen.js`](offscreen.js) と通信しながらキー/BPM 解析を実行。

## 使い方

1. 拡張機能を Chrome に読み込み、ポップアップで録音秒数を設定し「キー・BPM推定を開始」を押す。
2. 指定秒数録音後、自動で解析され、結果がポップアップに表示されます。

## 開発時の命名規則

PRタイトルは[Conventional Commits](https://www.conventionalcommits.org/)形式にします。Release Notesにはマージ済みPRのタイトルが掲載されるため、利用者が変更内容を理解できる表現にしてください。

```text
feat: add a new user-facing feature
fix(audio): correct capture cleanup
docs: update the privacy policy
refactor: simplify internal message handling
chore: update repository maintenance files
```

破壊的変更には、型またはスコープの後ろに`!`を付けます（例：`feat!: change the analysis result format`）。個々のコミットメッセージにも同じ形式を推奨します。

PRには、Release Notesの分類に使用する次のラベルを付けます。

- `enhancement`または`feature`: 新機能
- `bug`または`fix`: 不具合修正
- `documentation`: 文書
- `maintenance`、`dependencies`、`chore`: 保守作業
- `skip-changelog`: Release Notesに掲載しない変更

PRタイトルは[Validate PR title workflow](.github/workflows/pr-title.yml)で検査されます。ラベルごとのRelease Notes構成は[`.github/release.yml`](.github/release.yml)で管理します。

## リリース方法

GitHub Releaseは`vMAJOR.MINOR.PATCH`形式のタグをpushすると自動作成されます。タグを作る前に、Chromeで未パッケージ拡張として主要機能を確認してください。

1. リリース対象の変更を`main`へマージする。
2. `manifest.json`の`version`を次の3要素バージョンへ更新し、PRとして`main`へマージする。
3. 更新後の`main`を取得し、同じバージョンの注釈付きタグを作成する。
4. タグをGitHubへpushする。

例として、公開済み`1.1`の次に不具合修正版`1.1.1`を公開する場合は次のとおりです。

```bash
git switch main
git pull --ff-only
git tag -a v1.1.1 -m "v1.1.1"
git push origin v1.1.1
```

[Create GitHub Release workflow](.github/workflows/release.yml)は次を自動実行します。

- タグと`manifest.json`のバージョン一致確認
- JavaScriptとJSONの静的検証
- Chrome ウェブストア提出用ZIPの作成
- ZIPのSHA-256チェックサム作成
- マージ済みPRからRelease Notesを生成
- ZIPとチェックサムを添付したGitHub Releaseの公開

タグまたは`manifest.json`が`MAJOR.MINOR.PATCH`形式でない場合や、両者のバージョンが一致しない場合はReleaseを作成しません。

Chrome ウェブストアへの公開はGitHub Releaseとは別です。GitHub Releaseに添付されたZIPを、既存のAudio Key Analyzerアイテムへアップロードして審査に提出します。GitHub Releaseを作成しただけでは、Chrome ウェブストア版や利用者の拡張機能は更新されません。
