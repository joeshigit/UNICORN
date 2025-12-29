# 獨角獸 - Unicorn - DataCaptureSystem

## 系統簡介

這是一個**公司內部（同一個 Google Workspace 網域）**可重複使用的「資料收集平台」。

- **Leader（表格設計者）**：用「表格設定平台」快速建立資料收集表格
- **Staff（資料填報者）**：選表格 → 填欄位 → 上傳檔案 → 送出

所有提交進同一張 universal table（`submissions`），檔案上傳到 Shared Drive。

---

## 技術架構

- **Frontend**：Next.js + Firebase Hosting
- **Backend**：Cloud Functions 2nd gen
- **Database**：Firestore
- **Storage**：Google Drive（Shared Drive）
- **Auth**：Firebase Authentication（Google Sign-In，限公司網域）

---

## 核心功能（Stage 1）

### Staff 功能
- 選擇表格（Template）
- 動態表單填寫（text/number/date/dropdown/textarea/file/reference）
- 多檔上傳
- 我的提交（檢視/編輯/取消）

### Leader 功能
- **表格管理**：新增/編輯/啟用/停用
- **下拉選項池管理**：新增/編輯/排序/停用
- **匯出**：匯出資料到 Google Sheet

---

## 資料結構

### Firestore Collections
- `templates`：表格定義
- `submissions`：唯一 universal table（所有填報資料）
- `optionSets`：下拉選項池

### 欄位型別（Stage 1）
| type | 說明 |
|------|------|
| `text` | 單行文字 |
| `number` | 數字 |
| `date` | 日期（可配對成範圍） |
| `dropdown` | 下拉選單（從 optionSets） |
| `textarea` | 多行文字 |
| `file` | 檔案上傳（多檔） |
| `reference` | 引用其他 submission（**Submission as Options**） |
| `computed` | 計算欄位（Stage 1 佔位） |

---

## 目錄結構

```
unicorn-dcs/
├── README.md                 # 本文件
├── docs/
│   └── architecture.md       # 詳細架構與開發計畫
├── web/                      # Next.js 前端（待建立）
├── functions/                # Cloud Functions（待建立）
└── firestore.rules           # Firestore 安全規則（待建立）
```

---

## 相關文件

- [架構與開發計畫](docs/architecture.md)
- [主題文件](../Universal-Data-Capture-Platform-Theme-Paper.md)

---

## Firebase 專案

- **Dev**：`unicorn-dcs-dev`
- **Prod**：`unicorn-dcs-prod`

---

## 版本歷史

- **2025-01-XX**：專案建立



