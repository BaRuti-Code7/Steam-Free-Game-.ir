// server.js
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
app.use(express.static("public"));

// کش ساده: هر 5 دقیقه یکبار داده‌ی تازه می‌گیریم
let cache = { time: 0, data: null };
const FIVE_MIN = 5 * 60 * 1000;

async function fetchFreeFromSteamDB() {
  // اگر کش تازه‌ست، همونو بده
  if (cache.data && Date.now() - cache.time < FIVE_MIN) {
    return cache.data;
  }

  // 1) صفحه‌ی پروموشن‌های رایگان SteamDB
  const url = "https://steamdb.info/upcoming/free/";
  const html = (await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (single-page demo)",
      "Accept-Language": "en-US,en;q=0.9"
    }
  })).data;

  // 2) با cheerio (مثل قیچی) HTML رو می‌بُریم و لینک‌های /app/ رو پیدا می‌کنیم
  const $ = cheerio.load(html);
  const items = [];

  $('a[href*="/app/"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/\/app\/(\d+)/);
    if (!m) return;

    const appid = m[1];
    const name = $(el).text().trim();

    // متن اطراف لینک رو می‌گیریم تا نوع پروموشن رو حدس بزنیم
    const rowText = ($(el).closest("tr, li, div").text() || "").toLowerCase();

    // اگر اصلاً حرفی از «free» نبود، بی‌خیال (برای کم‌اشتباه‌تر شدن)
    if (!rowText.includes("free")) return;

    const promoType =
      rowText.includes("free to keep") ? "free_to_keep" :
      (rowText.includes("free weekend") || rowText.includes("play for free")) ? "free_weekend" :
      "unknown";

    items.push({
      appid,
      name: name || `App ${appid}`,
      promoType,
      storeUrl: `https://store.steampowered.com/app/${appid}`,
      steamdbUrl: new URL(href, "https://steamdb.info").href,
      capsule: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_616x353.jpg`
    });
  });

  // 3) تکراری‌ها حذف
  const map = {};
  for (const it of items) map[it.appid] = it;
  const unique = Object.values(map);

  // 4) ذخیره در کش
  cache = { time: Date.now(), data: unique };
  return unique;
}

// API کوچیک برای فرانت‌اند
app.get("/api/free", async (req, res) => {
  try {
    const list = await fetchFreeFromSteamDB();
    res.set("Cache-Control", "public, max-age=60");
    res.json({ updatedAt: new Date().toISOString(), count: list.length, items: list });
  } catch (e) {
    res.status(500).json({ error: e.message || "failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('server running on port', PORT);
});

