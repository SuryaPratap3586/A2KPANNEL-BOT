/** @type {import('next').NextConfig} */
const common = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];
module.exports = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/((?!app).*)", headers: [...common, { key: "X-Frame-Options", value: "DENY" }, { key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] },
      // Telegram Web App must be framed by Telegram only
      { source: "/app", headers: [...common, { key: "Content-Security-Policy", value: "frame-ancestors https://web.telegram.org https://*.telegram.org" }] },
    ];
  },
};
