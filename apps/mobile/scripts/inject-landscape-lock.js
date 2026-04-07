/**
 * Post-build script: Injects landscape-lock overlay into dist/index.html
 *
 * This ensures the portrait rotate-screen overlay is present from the very
 * first paint — before React/JS boots — so there is zero flash of portrait
 * content on mobile devices.
 */
const fs = require("fs");
const path = require("path");

const htmlPath = path.join(__dirname, "..", "dist", "index.html");

if (!fs.existsSync(htmlPath)) {
  console.error("❌ dist/index.html not found. Run expo export first.");
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, "utf-8");

// ─── 1. CSS to inject ────────────────────────────────────────────────────────
const injectCSS = `
<style id="landscape-lock">
  /* ===== Portrait Lock Overlay ===== */
  #portrait-lock-overlay {
    display: none;
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    z-index: 99999;
    background: linear-gradient(135deg, #0a1628 0%, #122440 50%, #1a3358 100%);
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
                 'Helvetica Neue', Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* Only show on touch devices (phones/tablets) in portrait */
  @media screen and (orientation: portrait) and (max-width: 1024px) {
    #portrait-lock-overlay {
      display: flex !important;
    }
    #root {
      display: none !important;
    }
  }

  /* ---- Phone icon ---- */
  .plk-phone-wrapper {
    position: relative;
    width: 120px;
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 36px;
  }

  .plk-phone {
    width: 42px;
    height: 72px;
    border: 3px solid #ffd600;
    border-radius: 10px;
    background: rgba(255, 214, 0, 0.06);
    position: relative;
    animation: plk-rotate 3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    box-shadow:
      0 0 24px rgba(255, 214, 0, 0.12),
      inset 0 0 12px rgba(255, 214, 0, 0.04);
  }

  /* Home bar */
  .plk-phone::before {
    content: '';
    position: absolute;
    bottom: 5px;
    left: 50%;
    transform: translateX(-50%);
    width: 14px;
    height: 2px;
    background: #ffd600;
    border-radius: 2px;
    opacity: 0.5;
  }

  /* Notch / speaker */
  .plk-phone::after {
    content: '';
    position: absolute;
    top: 5px;
    left: 50%;
    transform: translateX(-50%);
    width: 16px;
    height: 3px;
    background: #ffd600;
    border-radius: 2px;
    opacity: 0.25;
  }

  /* Screen content indicator */
  .plk-screen {
    position: absolute;
    top: 14px;
    left: 5px;
    right: 5px;
    bottom: 14px;
    border-radius: 3px;
    background: linear-gradient(180deg,
      rgba(26, 120, 136, 0.25) 0%,
      rgba(26, 120, 136, 0.08) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .plk-screen::after {
    content: '🀄';
    font-size: 16px;
    opacity: 0.6;
  }

  @keyframes plk-rotate {
    0%, 12%   { transform: rotate(0deg); }
    32%, 68%  { transform: rotate(-90deg); }
    88%, 100% { transform: rotate(0deg); }
  }

  /* Rotation arrow */
  .plk-arrow {
    position: absolute;
    bottom: 8px;
    right: 8px;
    width: 28px;
    height: 28px;
    opacity: 0;
    animation: plk-arrow-show 3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }

  .plk-arrow svg {
    width: 100%;
    height: 100%;
  }

  @keyframes plk-arrow-show {
    0%, 12%   { opacity: 0; transform: rotate(0deg); }
    20%, 28%  { opacity: 0.8; transform: rotate(0deg); }
    32%, 68%  { opacity: 0; transform: rotate(-45deg); }
    88%, 100% { opacity: 0; transform: rotate(0deg); }
  }

  /* ---- Text ---- */
  .plk-title {
    color: #e0f0f5;
    font-size: 18px;
    font-weight: 700;
    margin: 0 0 10px 0;
    letter-spacing: 1.5px;
    text-align: center;
    text-shadow: 0 2px 12px rgba(224, 240, 245, 0.15);
  }

  .plk-subtitle {
    color: #6a8fa0;
    font-size: 13px;
    font-weight: 400;
    margin: 0;
    letter-spacing: 0.5px;
    text-align: center;
  }

  /* Decorative glow behind phone */
  .plk-glow {
    position: absolute;
    width: 160px;
    height: 160px;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      rgba(255, 214, 0, 0.08) 0%,
      transparent 70%
    );
    animation: plk-glow-pulse 3s ease-in-out infinite;
    pointer-events: none;
  }

  @keyframes plk-glow-pulse {
    0%, 100% { transform: scale(1); opacity: 0.6; }
    50%      { transform: scale(1.15); opacity: 1; }
  }
</style>
`;

// ─── 2. Overlay HTML to inject ───────────────────────────────────────────────
const injectOverlay = `
<div id="portrait-lock-overlay">
  <div class="plk-phone-wrapper">
    <div class="plk-glow"></div>
    <div class="plk-phone">
      <div class="plk-screen"></div>
    </div>
    <div class="plk-arrow">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7.11 8.53 5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zM6.09 13H4.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47zm1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L7.1 18.32zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z" fill="#ffd600"/>
      </svg>
    </div>
  </div>
  <p class="plk-title">画面を横向きにしてください</p>
  <p class="plk-subtitle">このゲームは横画面専用です</p>
</div>
`;

// ─── 3. Meta tags ────────────────────────────────────────────────────────────
const injectMeta = `
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="screen-orientation" content="landscape">
    <link rel="manifest" href="/manifest.json">
`;

// ─── 4. Early orientation lock script ────────────────────────────────────────
const injectScript = `
<script>
  // Attempt Screen Orientation API lock (works in fullscreen / PWA on Android)
  try {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(function(){});
    }
  } catch(e) {}
</script>
`;

// ─── Perform injections ──────────────────────────────────────────────────────

// Update viewport meta to include viewport-fit=cover and user-scalable=no
html = html.replace(
  /(<meta\s+name="viewport"\s+content=")([^"]*)("\s*\/?>)/i,
  '$1width=device-width, initial-scale=1, shrink-to-fit=no, user-scalable=no, viewport-fit=cover$3'
);

// Inject CSS + meta before </head>
html = html.replace("</head>", injectCSS + injectMeta + injectScript + "\n  </head>");

// Inject overlay after opening <body>
html = html.replace(/<body[^>]*>/, "$&\n" + injectOverlay);

fs.writeFileSync(htmlPath, html, "utf-8");
console.log("✅ Landscape lock overlay injected into dist/index.html");
