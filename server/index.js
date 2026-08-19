/* ============================================================
   server/index.js — servidor Express: API + arquivos estáticos
   ============================================================ */
"use strict";
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { initDb } = require("./db");

const app = express();
app.set("trust proxy", 1); // necessário no Railway para req.secure refletir o proxy HTTPS

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.use("/api/auth", require("./routes/auth"));
app.use("/api/orcamentos", require("./routes/orcamentos"));
app.use("/api/parametros", require("./routes/parametros"));
app.use("/api/usuarios", require("./routes/usuarios"));

const ROOT = path.join(__dirname, "..");
app.use(express.static(ROOT));

// Roteamento client-side (hash-based): qualquer GET que não seja /api/* recebe o index.html.
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno no servidor." });
});

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`[server] Calculadora Biomassa & Lightwall no ar na porta ${PORT}`));
  })
  .catch((err) => {
    console.error("[server] Falha ao inicializar o banco de dados:", err);
    process.exit(1);
  });
