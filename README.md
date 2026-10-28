# レシート家計簿（Webアプリ版）

## 公開手順（無料・Macで10分）
1. https://github.com でアカウント作成（持っていればログイン）
2. 右上「＋」→ **New repository**
   - 名前: `kakeibo` / **Public** を選択 → Create repository
3. 「uploading an existing file」をクリック → このフォルダの中身（index.html など6ファイル）をドラッグ → **Commit changes**
4. リポジトリの **Settings → Pages**
   - Source: **Deploy from a branch** / Branch: **main**・**/(root)** → Save
5. 1〜2分待つと `https://あなたのユーザー名.github.io/kakeibo/` で開けます

## iPhoneに入れる
1. 上のURLを **Safari** で開く
2. 共有ボタン（□↑）→ **ホーム画面に追加**
3. 以降はホーム画面のアイコンから起動（期限なし）

## メモ
- 初回の読み取りだけ、読み取りエンジン（約5MB）をダウンロードします。以降はオフラインでも動きます
- データはiPhone内（ホーム画面のアプリ専用の保存領域）に保存。外部には送りません
- アプリを削除するとデータも消えるので、ときどき「バックアップを保存」でファイルアプリなどに保存してください
- 公開URLを知っている人も画面は開けますが、データは各自のスマホにしか入らないので見られません
- 修正したいときは、GitHubで index.html を上書きアップロード → アプリを開き直すと反映
