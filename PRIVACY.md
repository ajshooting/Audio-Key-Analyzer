# Audio Key Analyzer Privacy Policy

Effective date: July 31, 2026  
Last updated: August 1, 2026

Audio Key Analyzer analyzes audio from the active browser tab to estimate its musical key and BPM. This policy explains how the extension handles that audio.

## Data handled by the extension

When the user selects **Start Key & BPM Detection**, the extension temporarily accesses audio samples from the active tab for the duration selected by the user.

The extension uses the audio only to estimate the musical key and BPM requested by the user.

## Local processing and retention

- Audio processing is performed locally on the user's device.
- Audio samples are held temporarily in memory during capture and analysis.
- Audio samples are not written to files, databases, or browser storage.
- To restore the popup after it is closed, the extension temporarily stores only the analysis phase, selected duration, timestamps, final result, or error in `chrome.storage.session`. Audio samples are never included.
- `chrome.storage.session` is memory-only. This state is cleared when Chrome restarts or when the extension is disabled, reloaded, or updated.

## Transmission and sharing

- Audio samples and analysis results are not transmitted to the developer or to external servers.
- Data is not sold, shared with third parties, or used for advertising, profiling, creditworthiness, or purposes unrelated to key and BPM analysis.
- The bundled Essentia.js library runs locally within the extension. Audio is not sent to the Essentia project or another service.

## Chrome permissions

The extension uses these permissions only for its stated purpose:

- `tabCapture`: Captures audio from the active tab after the user starts an analysis.
- `offscreen`: Provides an extension-owned document that continues capture, preserves tab audio playback, and runs the bundled local analysis after the popup closes.
- `storage`: Temporarily retains the audio-free analysis status and result in memory-only `chrome.storage.session` so the popup can be restored.

The use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including its Limited Use requirements.

## Changes to this policy

If the extension's data handling changes, this policy and the disclosures shown to users will be updated before the new practices take effect.

## Contact

Questions about this policy can be submitted through [GitHub Issues](https://github.com/ajshooting/Audio-Key-Analyzer/issues).

---

# Audio Key Analyzer プライバシーポリシー

制定日：2026年7月31日  
最終更新日：2026年8月1日

Audio Key Analyzerは、現在のブラウザタブの音声を解析して、楽曲のキーとBPMを推定するChrome拡張機能です。本ポリシーでは、拡張機能が音声をどのように取り扱うかを説明します。

## 拡張機能が取り扱うデータ

ユーザーが「キー・BPM推定を開始」を選択した場合に限り、ユーザーが指定した時間、現在のタブの音声サンプルへ一時的にアクセスします。

音声は、ユーザーが要求したキーとBPMの推定にのみ使用します。

## 端末内処理と保持

- 音声処理はユーザーの端末内で行います。
- 音声サンプルは、取得・解析中に限り一時的にメモリ上で取り扱います。
- 音声サンプルを、ファイル、データベース、ブラウザストレージへ保存しません。
- ポップアップを閉じた後に表示を復元するため、処理段階、選択した解析時間、時刻、完了結果またはエラーだけを`chrome.storage.session`へ一時保持します。音声サンプルは含まれません。
- `chrome.storage.session`はメモリ専用です。この状態はChromeの再起動、拡張機能の無効化・再読み込み・更新時に消去されます。

## 外部送信と共有

- 音声サンプルおよび解析結果を、開発者または外部サーバーへ送信しません。
- データを販売、第三者提供、広告、プロファイリング、信用評価、またはキー・BPM解析と無関係な目的に使用しません。
- 同梱しているEssentia.jsは拡張機能内でローカル実行されます。Essentiaプロジェクトやその他のサービスへ音声を送信しません。

## Chrome権限

以下の権限を、明示した目的にのみ使用します。

- `tabCapture`：ユーザーが解析を開始した後、現在のタブの音声を取得するために使用します。
- `offscreen`：ポップアップを閉じた後も、音声取得、タブ音声の再生維持、同梱コードによるローカル解析を続けるために使用します。
- `storage`：ポップアップの表示を復元するため、音声を含まない解析状態と結果をメモリ専用の`chrome.storage.session`へ一時保持するために使用します。

Chrome APIから受け取った情報は、Limited Use要件を含むChrome Web Store User Data Policyに従って使用します。

## 本ポリシーの変更

拡張機能のデータ取扱いを変更する場合は、新しい取扱いを開始する前に、本ポリシーおよびユーザー向けの開示を更新します。

## お問い合わせ

本ポリシーに関するお問い合わせは、[GitHub Issues](https://github.com/ajshooting/Audio-Key-Analyzer/issues)へお寄せください。
