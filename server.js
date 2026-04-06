require("dotenv").config();
const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const supabase = require("./lib/supabase");

/* =========================
   provinces
========================= */
app.get("/provinces", async (req, res) => {
  const { data, error } = await supabase.from("provinces").select("*").order("name");

  if (error) {
    console.error("❌ provinces error:", error);
    return res.status(500).json({ error: error.message });
  }

  res.json(data || []);
});

/* =========================
   grades（改用 id）
========================= */
app.get("/grades/:provinceId", async (req, res) => {
  const { provinceId } = req.params;

  const { data } = await supabase
    .from("grades")
    .select("id, level")
    .eq("province_id", provinceId)
    .order("level");

  res.json(data || []);
});

/* =========================
   courses
========================= */
app.get("/courses/:gradeId", async (req, res) => {
  const { gradeId } = req.params;

  const { data } = await supabase
    .from("courses")
    .select("id, code, title")
    .eq("grade_id", gradeId)
    .order("code");

  res.json(data || []);
});

/* =========================
   add course（返回 id）
========================= */
app.post("/add-course", async (req, res) => {
  const { gradeId, code, title } = req.body;

  const { data: existing } = await supabase
    .from("courses")
    .select("id")
    .eq("code", code)
    .eq("grade_id", gradeId)
    .maybeSingle();

  if (existing) {
    return res.json(existing);
  }

  const { data } = await supabase
    .from("courses")
    .insert([{ code, title, grade_id: gradeId }])
    .select()
    .single();

  res.json(data);
});

/* =========================
   save front
========================= */
app.post("/save-front", async (req, res) => {
  const { courseId, front } = req.body;

  const { data: existing } = await supabase
    .from("fronts")
    .select("id, count")
    .eq("front", front)
    .eq("course_id", courseId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("fronts")
      .update({ count: existing.count + 1 })
      .eq("id", existing.id);
  } else {
    await supabase.from("fronts").insert([{ front, course_id: courseId }]);
  }

  res.send("ok");
});

/* =========================
   PDF（修复 puppeteer）
========================= */
app.post("/generate-pdf", async (req, res) => {
  const { cards } = req.body;

  /* =========================
     1. 每6张一页，不足补空
  ========================= */
  const pages = [];
  for (let i = 0; i < cards.length; i += 6) {
    const chunk = cards.slice(i, i + 6);

    while (chunk.length < 6) {
      chunk.push({ front: "", back: "" });
    }

    pages.push(chunk);
  }

  /* =========================
     2. 正面 + 背面（镜像）
  ========================= */
  const order = [1,0,3,2,5,4];
  const allPages = [];

  pages.forEach(p => {

    /* front */
    allPages.push(`
      <div class="page front">
        ${p.map(c => `<div class="card">${c.front}</div>`).join("")}
      </div>
    `);

    /* back（镜像） */
    allPages.push(`
      <div class="page back">
        ${order.map(i => `<div class="card">${p[i].back}</div>`).join("")}
      </div>
    `);

  });

  /* =========================
     4. HTML + 核心CSS（重点）
  ========================= */
  const html = `
  <html>
  <head>
  <style>

  @page {
    size: Letter;
    margin: 0;
  }

  body {
    margin: 0;
    padding: 0;
  }

  /* 每一页 */
  .page {
    width: 100%;
    height: 100vh; /* 🔥 关键：撑满整页 */
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: repeat(3, 1fr);
    page-break-after: always;
  }

  /* 每张卡 */
  .card {
    border: 1px solid #000;

    display: flex;
    align-items: center;
    justify-content: center;

    text-align: center;
    padding: 12px;

    /* 自动换行 */
    word-break: break-word;

    /* 自适应字体 */
    font-size: clamp(12px, 2.5vw, 24px);
    line-height: 1.3;
  }

  .page.back .card {
    border: none;
  }

  </style>
  </head>

  <body>
    ${allPages.join("")}
  </body>
  </html>
  `;

  /* =========================
     5. Puppeteer
  ========================= */
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdf = await page.pdf({
    format: "Letter",
    printBackground: true
  });

  await browser.close();

  res.contentType("application/pdf");
  res.send(pdf);
});

app.listen(3000, () => console.log("Server running"));