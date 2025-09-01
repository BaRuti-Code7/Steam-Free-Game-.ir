// server.js
// ساده و تمیز: واکشی SteamDB، پارس با cheerio، خروجی JSON برای فرانت‌اند

const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
app.use(express.static("public"));

const FIVE_MIN = 5 * 60 * 1000;
let cache = { time: 0, data: null };

// واکشی و پارس: پروموشن‌های رایگان + پروموشن‌های احتمالی آینده
async function fetchFromSteamDB() {
  if (cache.data && Date.now() - cache.time < FIVE_MIN) return cache.data;

  const url = "https://steamdb.info/upcoming/free/";
  const html = (await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (single-page demo)",
      "Accept-Language": "en-US,en;q=0.9",
    },
    // timeout محافظتی
    timeout: 20000,
  })).data;

  const $ = cheerio.load(html);

  // ۱) استخراج آیتم‌های رایگان/فری‌ویکند
  const found = [];
  $('a[href*="/app/"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/\/app\/(\d+)/);
    if (!m) return;
    const appid = m[1];
    const name = ($(el).text() || "").trim();

    // متن اطراف: برای فهمیدن نوع پروموشن
    const rowText = ($(el).closest("tr, li, div").text() || "").toLowerCase();
    if (!rowText.includes("free")) return; // فقط موارد رایگان را نگه داریم

    const promoType =
      rowText.includes("free to keep") ? "free_to_keep" :
      (rowText.includes("free weekend") || rowText.includes("play for free")) ? "free_weekend" :
      "unknown";

    found.push({
      appid,
      name: name || `App ${appid}`,
      promoType,
      storeUrl: `https://store.steampowered.com/app/${appid}`,
      steamdbUrl: new URL(href, "https://steamdb.info").href,
      capsule: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_616x353.jpg`,
    });
  });

  // یکتا سازی
  const map = {};
  for (const it of found) map[it.appid] = it;
  const items = Object.values(map);

  // ۲) «پروموشن‌های احتمالی آینده»
  // ساختار SteamDB: h2 با متن Potentially Upcoming Free Promotions و بعدش یک <ul> لیست
  const upcoming = [];
  $('h2').each((_, h) => {
    const title = ($(h).text() || "").trim();
    if (/Potentially\s+Upcoming\s+Free\s+Promotions/i.test(title)) {
      const $ul = $(h).nextAll("ul").first();
      $ul.find("li").each((__, li) => {
        const t = $(li).text().trim();
        if (t) upcoming.push(t);
      });
    }
  });

  const payload = {
    updatedAt: new Date().toISOString(),
    items,
    upcoming,
  };

  cache = { time: Date.now(), data: payload };
  return payload;
}

// API
app.get("/api/free", async (req, res) => {
  try {
    const data = await fetchFromSteamDB();
    res.set("Cache-Control", "public, max-age=60");
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e?.message || "fetch_failed" });
  }
});

// برای Render/VPS
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("server running on", PORT);
});
