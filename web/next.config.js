/** @type {import('next').NextConfig} */
const nextConfig = {
  // 使用動態路由，不使用靜態輸出
  // output: 'export',  // 暫時關閉，因為有動態路由 [templateId]
  
  // 圖片最佳化
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig


