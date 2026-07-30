/** @type {import('next').NextConfig} */
const nextConfig = {
  // 純前端 SPA，直接輸出靜態檔給 Firebase Hosting
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
}

module.exports = nextConfig
