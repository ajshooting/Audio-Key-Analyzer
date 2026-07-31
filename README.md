# Audio Key Analyzer - Chrome Extension

現在のタブで再生中の音声を端末内で解析し、楽曲のキーとBPMを推定するChrome拡張機能です。解析には同梱した[Essentia.js](https://mtg.github.io/essentia.js/)を使用します。

- [Chrome ウェブストア](https://chromewebstore.google.com/detail/lfcaafpepmhjbiiiglahjdameobdjdch)
- [プライバシーポリシー](PRIVACY.md)
- [変更履歴](CHANGELOG.md)

## 動作環境

- Google Chrome 116以降
- 音声を再生している通常のブラウザタブ

Chrome 116以降を必要とするのは、service workerで取得した`tabCapture`のstream IDをoffscreen documentで使用するためです。

## 主な機能

- 3〜30秒の範囲で解析時間を指定
- ステレオ音声をモノラルへ変換し、44.1 kHzで解析
- キー、スケール、BPMを端末内で推定
- 録音中にポップアップを閉じても処理を継続
- ポップアップを開き直した際に進捗または完了結果を再表示

## データの取扱い

音声サンプルはoffscreen documentのメモリ内だけで一時的に扱い、ファイル、データベース、ブラウザストレージへ保存しません。開発者や外部サーバーへの送信も行いません。

ポップアップを閉じた後に状態を復元するため、処理段階、解析時間、時刻、完了結果またはエラーだけを`chrome.storage.session`へ一時保持します。ここに音声データは含まれず、Chromeの再起動、拡張機能の無効化・再読み込み・更新時に消去されます。詳細は[PRIVACY.md](PRIVACY.md)を参照してください。

## 使用する権限

| 権限 | 用途 |
| --- | --- |
| `tabCapture` | ユーザー操作後に現在のタブの音声stream IDを取得するため |
| `offscreen` | ポップアップから独立して録音・再生維持・ローカル解析を実行するため |
| `storage` | 音声を含まない進捗と結果をメモリ専用の`storage.session`へ一時保持するため |

ホスト権限は要求せず、拡張機能のファイルを`web_accessible_resources`としてウェブページへ公開していません。

## 構成

処理の流れは次のとおりです。

1. `popup.js`が解析開始をservice workerへ依頼します。
2. `background.js`が`tabCapture.getMediaStreamId()`で現在のタブのstream IDを取得します。
3. `offscreen.js`がstream IDを音声streamへ変換し、録音、モノラル化、バッファリングを行います。
4. 音声の`ArrayBuffer`をsandbox iframeへ直接transferし、`sandbox.js`がEssentia.jsで解析します。
5. `background.js`が音声を含まない状態と結果だけを`storage.session`へ保存し、ポップアップへ通知します。

主なファイルは次のとおりです。

- `popup.html` / `popup.js`: 解析時間の入力、開始操作、進捗・結果表示
- `display-utils.js`: 近似BPMと相対調を含むキー表記の整形
- `background.js`: offscreen documentのライフサイクル、stream ID取得、セッション状態管理
- `offscreen.html` / `offscreen.js`: 音声取得、再生維持、バッファリング、sandboxとの通信
- `audio-processor.js`: ステレオ音声をモノラル化するAudioWorklet
- `sandbox.html` / `sandbox.js`: 権限から隔離された環境でのEssentia.js解析
- `tests/`: Node標準テストランナーで実行する回帰テスト

## ローカルでの確認

### Chromeへ読み込む

1. `chrome://extensions`を開きます。
2. 「デベロッパー モード」を有効にします。
3. 「パッケージ化されていない拡張機能を読み込む」から、このリポジトリのルートを選択します。
4. 音声を再生しているタブでポップアップを開き、解析を開始します。
5. 録音中にポップアップを閉じ、再度開いて処理が継続していることも確認します。

### 自動テスト

外部依存のインストールは不要です。Node.js 24で次を実行します。

```bash
node --test tests/*.test.js
```

JSONとJavaScriptの静的検証を含む同じ確認は、PRと`main`へのpush時に[Validate extension workflow](.github/workflows/ci.yml)でも実行されます。

## 開発時の命名規則

PRタイトルとコミットメッセージは[Conventional Commits](https://www.conventionalcommits.org/)形式にします。Release Notesにはマージ済みPRのタイトルが掲載されるため、利用者が変更内容を理解できる表現にしてください。

```text
feat: add a new user-facing feature
fix(audio): correct capture cleanup
docs: update the privacy policy
refactor: simplify internal message handling
chore: update repository maintenance files
```

破壊的変更には、型またはスコープの後ろに`!`を付けます（例：`feat!: change the analysis result format`）。

PRには、Release Notesの分類に使用する次のラベルを付けます。

- `enhancement`または`feature`: 新機能
- `bug`または`fix`: 不具合修正
- `documentation`: 文書
- `maintenance`、`dependencies`、`chore`: 保守作業
- `skip-changelog`: Release Notesに掲載しない変更

PRタイトルは[Validate PR title workflow](.github/workflows/pr-title.yml)で検査されます。ラベルごとのRelease Notes構成は[`.github/release.yml`](.github/release.yml)で管理します。

## 配布ZIPの作成

配布ZIPは作業ツリーではなく、指定したGitコミットの追跡済みファイルから作成します。同じコミットから実行すれば同一内容とSHA-256になります。

```bash
scripts/package-extension.sh 1.2.0 HEAD
```

生成物は`dist/Audio-Key-Analyzer-v1.2.0.zip`と、その`.sha256`ファイルです。指定バージョンと対象コミットの`manifest.json`が一致しない場合は失敗します。

## GitHub Releaseの作成

GitHub Releaseは`vMAJOR.MINOR.PATCH`形式のタグをpushすると自動作成されます。タグ作成前に次を確認してください。

1. リリース対象を`main`へマージする。
2. `manifest.json`を公開予定バージョンへ更新する。
3. `CHANGELOG.md`へ同じバージョンの変更内容と日付を記載する。
4. 自動テストとChromeでの手動確認を行う。
5. 更新後の`main`に、同じバージョンの注釈付きタグを作成する。

v1.2.0の例は次のとおりです。

```bash
git switch main
git pull --ff-only
node --test tests/*.test.js
git tag -a v1.2.0 -m "v1.2.0"
git push origin v1.2.0
```

[Create GitHub Release workflow](.github/workflows/release.yml)は次を自動実行します。

- タグ、`manifest.json`、`main`に含まれるコミットかどうかの確認
- JSON、JavaScript、自動テストの実行
- 再現可能なChrome ウェブストア提出用ZIPの作成
- ZIPのSHA-256チェックサム作成
- CHANGELOGとマージ済みPRからRelease Notesを生成
- ZIPとチェックサムを添付したGitHub Releaseの公開

タグ作成、タグのpush、GitHub Release公開は取り消しにくい操作なので、自動化の起動点はタグのpushに限定しています。

## Chrome ウェブストアの更新

GitHub Releaseを作成しただけではChrome ウェブストア版は更新されません。[Chrome ウェブストアの更新手順](https://developer.chrome.com/docs/webstore/update/)に従い、次を手動で行います。

1. GitHub Releaseに添付されたZIPとSHA-256を確認します。
2. Chrome Developer Dashboardで既存のAudio Key Analyzerを開きます。
3. 「Package」タブの「Upload New Package」からZIPをアップロードします。
4. 「Privacy practices」の申告内容と、公開されている[PRIVACY.md](PRIVACY.md)の内容が一致していることを確認します。
5. ストア掲載情報と配布範囲を確認し、審査へ提出します。

プライバシーポリシーURLには、mainへpush後の次の公開URLを使用できます。

```text
https://github.com/ajshooting/Audio-Key-Analyzer/blob/main/PRIVACY.md
```

## ライセンス

このプロジェクトは[GNU Affero General Public License v3.0](LICENSE)で公開されています。同梱しているEssentia.jsにも、配布元に含まれる[AGPL-3.0ライセンス](essentia/LICENSE)が適用されます。
