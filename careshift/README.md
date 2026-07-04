# CareShift — 介護施設向けシフト・勤怠・給与管理システム

シフト作成・勤怠打刻・給与計算までを一気通貫で扱える、介護施設向けの業務管理システムです。

## 技術スタック

- **フロントエンド**: React 18 + TypeScript + Vite + Tailwind CSS + Zustand
- **バックエンド**: Node.js + Express.js + TypeScript
- **DB**: PostgreSQL + Prisma
- **認証**: JWT（httpOnly Cookie）
- **テスト**: Vitest（給与計算エンジン）

---

## セットアップ手順

### 1. リポジトリを取得

```bash
git clone <リポジトリURL>
cd my-first-project/careshift
```

### 2. 環境変数の設定

```bash
cp backend/.env.example backend/.env
# backend/.env を編集し、DATABASE_URL と JWT_SECRET を設定してください
```

`.env` のポイント:

| 変数 | 説明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 接続文字列 |
| `JWT_SECRET` | 本番では 32 文字以上のランダム文字列に変更 |
| `NODE_ENV` | 本番は `production` |
| `CORS_ORIGIN` | 本番はフロントのドメイン（カンマ区切りで複数可） |
| `FACILITY_NAME` | 給与明細PDFに表示する施設名 |

### 3. バックエンドのセットアップ

```bash
cd backend
npm install
npx prisma migrate dev      # スキーマをDBに反映
npx prisma generate         # Prisma Client を生成
npm run db:seed             # 初期データ（管理者・50名のスタッフ・給与項目 等）
npm run db:seed:attendance  # 検証用の当月ダミー勤怠（任意）
```

### 4. フロントエンドのセットアップ

```bash
cd ../frontend
npm install
```

### 5. 起動

```bash
# バックエンド（別ターミナル）
cd ~/my-first-project/careshift/backend && npm run dev

# フロントエンド（別ターミナル）
cd ~/my-first-project/careshift/frontend && npm run dev
```

### 6. ブラウザでアクセス

http://localhost:5173

---

## 初期ログイン情報

| ユーザー | ID | パスワード |
|----------|-----|-----------|
| 管理者 | `admin` | `Admin1234!` |
| スタッフ（例） | `staff001`〜`staff050` | `Staff1234!` |

> ⚠️ 本番環境では必ずパスワードを変更してください。

---

## テスト

```bash
cd backend
npm test        # 給与計算エンジンの単体テスト（Vitest）
```

## ヘルスチェック

```
GET /api/health  →  { "status": "ok", "version": "1.0.0", "timestamp": "..." }
```

---

## 主な機能

### Phase 1 — 認証・マスタ管理
- ログイン / JWT 認証 / ロール別リダイレクト
- ログイン5回失敗でアカウントロック（30分）
- スタッフ管理（登録・編集・有効/無効）
- グループ管理（作成・編集・メンバー割り当て）
- 管理者ダッシュボード・左サイドバー

### Phase 2 — シフト・勤怠
- シフト種別マスタ（日勤・夜勤・早番・遅番）
- 月間シフト管理グリッド（管理者）
- シフト自動生成（夜勤翌日ルール・公平分配・グループ別設定）
- スタッフ：シフトカレンダー（月/週）
- 勤怠打刻（出勤・退勤・休憩）／管理者による勤怠の追加・修正・削除

### Phase 3 — 給与
- 給与項目設定（追加・編集・削除・並び替え）
- 給与計算エンジン（時給制・月給制・残業・深夜・休日出勤・夜勤手当）
  - 残業＝勤怠種類の所定時間を超えた分／夜勤手当＝1回¥8,000（設定変更可）
  - 端数処理：中間4桁保持・時間は分単位2桁・最終金額は1円未満切り捨て
- 給与計算画面（一括計算・個別修正・確定ロック・CSV出力）
- 給与明細PDF（印刷用HTML → ブラウザでPDF保存）
- スタッフ：給与明細確認・PDFダウンロード

### Phase 4 — 仕上げ・セキュリティ
- 管理者ダッシュボード：本日の出勤中/欠勤/夜勤中/未打刻、今月の進捗、未打刻一覧、申請通知
- スタッフダッシュボード：今日のシフト・今月サマリー・打刻忘れ警告・お知らせ
- トースト通知・スケルトン・空状態UI・404/403ページ
- レートリミット（ログイン10回/15分・一般100回/分・PDF5回/分）
- パスワード変更バリデーション（8文字以上・英大小・数字・現在と異なる）
- DBインデックス最適化

---

## プロジェクト構成

```
careshift/
├── frontend/                # React + TypeScript + Vite + Tailwind
│   └── src/
│       ├── api/             # API クライアント
│       ├── components/      # 共通コンポーネント（Toast/Skeleton/EmptyState 等）
│       ├── pages/           # 画面（admin/ ・ staff/）
│       ├── stores/          # Zustand（auth / toast）
│       └── types/           # 型定義
└── backend/                 # Node.js + Express + Prisma
    ├── src/
    │   ├── middleware/      # 認証・レートリミット
    │   ├── routes/          # API ルート
    │   ├── services/        # 給与計算エンジン（payroll.calc / payroll.service）
    │   └── utils/           # 共通ユーティリティ
    └── prisma/
        ├── schema.prisma    # DB スキーマ
        ├── seed.ts          # 初期データ
        └── seedAttendance.ts# 検証用ダミー勤怠
```

## API の権限モデル

- `/api/v1/auth/login` のみ未認証で利用可
- 管理系 API は `ADMIN` ロール必須
- スタッフは自分のデータのみ参照可能（`/my` 系、給与明細は本人の確定分のみ）
