# CareShift - 介護施設向けシフト・勤怠・給与管理システム

## セットアップ手順

### 1. 環境変数の設定

```bash
cp .env.example .env
# .env ファイルを編集して DATABASE_URL などを設定してください
```

### 2. パッケージのインストール

```bash
# ルートから全パッケージをインストール
cd careshift

# ルートの依存関係をインストール
npm install

# バックエンドの依存関係をインストール
cd backend && npm install

# フロントエンドの依存関係をインストール
cd ../frontend && npm install
```

### 3. データベースのセットアップ

PostgreSQL が起動していることを確認してください。

```bash
cd backend

# Prisma Client を生成
npm run db:generate

# スキーマをデータベースに反映
npm run db:push

# 初期データを投入
npm run db:seed
```

### 4. 開発サーバーの起動

```bash
# careshift/ ディレクトリから
cd ..  # careshift/ ディレクトリに戻る
npm run dev
```

- フロントエンド: http://localhost:5173
- バックエンドAPI: http://localhost:3000

### 5. 初期ログイン

| ユーザーID | パスワード | ロール |
|-----------|-----------|--------|
| admin | Admin1234! | 管理者 |
| staff001 | Staff1234! | グループリーダー |
| staff002 | Staff1234! | スタッフ |
| staff003 | Staff1234! | スタッフ |

---

## プロジェクト構成

```
careshift/
├── frontend/          # React 18 + TypeScript + Vite + Tailwind CSS
│   └── src/
│       ├── api/       # API クライアント
│       ├── components/# 共通コンポーネント
│       ├── pages/     # ページコンポーネント
│       │   ├── admin/ # 管理者画面
│       │   └── staff/ # スタッフ画面
│       ├── stores/    # Zustand ストア
│       └── types/     # TypeScript 型定義
└── backend/           # Node.js + Express + TypeScript + Prisma
    ├── src/
    │   ├── middleware/# 認証ミドルウェア
    │   ├── routes/    # APIルート
    │   └── utils/     # ユーティリティ
    └── prisma/
        ├── schema.prisma # DBスキーマ
        └── seed.ts       # 初期データ
```

## Phase 1 実装内容

- ✅ 認証（JWT + httpOnly Cookie）
- ✅ ログイン失敗5回でアカウントロック
- ✅ スタッフ管理（一覧・登録・編集・無効化）
- ✅ グループ管理（作成・編集・削除・メンバー割り当て）
- ✅ 管理者ダッシュボード
- ✅ 左サイドバーナビゲーション
- ✅ ロールベースアクセス制御

## Phase 2（次フェーズ予定）

- シフト管理
- 勤怠打刻・管理

## Phase 3（次フェーズ予定）

- 給与計算
- 給与明細PDF出力
