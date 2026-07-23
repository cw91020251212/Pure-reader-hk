# PureRead HK｜純淨閱讀器

PureRead HK 是一個繁體中文介面的純淨閱讀工具，適合部署到 GitHub Pages。它可以協助提取文章內容、整理閱讀版面、刪除多餘段落，並支援文字朗讀、高光標示及字體調整。

## 建議 GitHub repo 名稱

`pure-reader-hk`

呢個名稱簡短、易讀、適合做網址，同時保留「純淨閱讀」同香港繁中語境。

## 檔案結構

- `index.html`：主頁檔案，已由原本 `index_1.html` 改成 GitHub Pages 預設可識別嘅名稱。
- `favicon.ico`：瀏覽器分頁圖標。
- `assets/`：不同尺寸嘅 icon，包括 favicon、Apple Touch Icon、PWA icon。
- `manifest.json`：網站捷徑 / PWA metadata。

## GitHub Pages 部署

1. 將呢個 zip 解壓。
2. 將所有檔案上載到 GitHub repo 根目錄。
3. 喺 GitHub repo 設定入面開啟 GitHub Pages。
4. Source 選擇 main branch / root。

完成後，GitHub Pages 會自動使用 `index.html` 作為首頁。
