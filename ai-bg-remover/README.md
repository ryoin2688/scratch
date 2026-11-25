# AI 圖片去背工具 (`ai-bg-remover`)

純前端免後端的瀏覽器本地 AI 圖片去背工具，使用 [`@imgly/background-removal`](https://www.npmjs.com/package/@imgly/background-removal) 在瀏覽器端執行去背運算。

## 功能特色

- **純前端免後端**：無需伺服器與 API Key，圖片全程留在本地瀏覽器中處理。
- **模型載入進度條**：首次使用自動下載 ONNX / WASM 模型並即時顯示進度條，載入後快取於瀏覽器。
- **拖曳 / 點擊 / 貼上上傳**：支援 PNG、JPG、WebP 格式圖片。
- **原圖 vs 去背結果對比**：提供「並排對比」與「滑桿對比」兩種檢視模式。
- **多底色邊緣檢查**：預設灰白透明格紋，可一鍵切換純白底或純黑底檢查邊緣毛邊。
- **一鍵下載透明 PNG**：立即匯出透明背景 PNG 圖片。

## 本地預覽

於專案目錄啟動任一靜態伺服器即可測試（因使用 ES Modules，請勿直接以 `file://` 開啟）：

```bash
python -m http.server 8080
```

接著開啟瀏覽器前往 `http://localhost:8080`。

## 部署至 GitHub Pages

本專案已內建 `.github/workflows/deploy.yml` 與 `.nojekyll`。推送至 GitHub `main` 分支後，於儲存庫 **Settings → Pages → Build and deployment** 選擇 **GitHub Actions**，即可自動完成發布。
