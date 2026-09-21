# PureRead HK

用 GitHub Pages 發佈後，請用 Android Chrome 開啟網站，再選擇「加入主畫面／安裝應用程式」。安裝完成後，從 Android 分享 HTML、HTM、Markdown 或純文字檔案時，可以選擇 PureRead HK。

## 本機檔案匯入

首頁有常駐「選擇文檔」面板，可按「瀏覽文檔」開啟系統選檔介面，亦可直接拖放文檔；面板會即時顯示已選檔名、大小同解析狀態。支援 `.html`、`.htm`、`.md`、`.markdown`、`.txt`、`.pdf`、`.doc`、`.docx`、`.docm`、`.rtf`、`.odt`、`.epub`、PowerPoint、Excel 同 `.csv`。PDF 會逐頁抽取文字；DOCX 會轉換標題、段落、列表同基本格式；舊式 DOC 及其他辦公格式會按需要載入 WebAssembly 解析器再轉成 Markdown。所有解析都喺瀏覽器本機完成，檔案唔會上傳到伺服器。

「貼上文字」及文章完成後的「追加圖片」都支援一次多選或分批連續加入多張圖片。產生文章之前可在預覽內用 **↑ 前移／↓ 後移** 排序；每張圖片會壓縮並內嵌到文章。無論圖片來自上傳、Markdown、Word、HTML 或網址，其文章內 **↑／↓** 控制都可把圖片越過標題、段落及其他圖片，移到文章內任意位置。

## GitHub Pages

1. 將呢個資料夾入面嘅檔案上載到 repository 根目錄。
2. 到 GitHub repository 的 **Settings → Pages**。
3. Source 選擇 **Deploy from a branch**，再選擇包含呢啲檔案嘅 branch 及 `/ (root)`。
4. 等 GitHub Pages 發佈後，用 HTTPS 網址開啟 `index.html`。

`manifest.json`、`sw.js` 同 `assets/icon.jpeg` 必須按原本資料夾結構放置，否則 Android 分享功能唔會註冊。
