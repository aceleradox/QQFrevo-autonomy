// instalar: npm install express axios cheerio
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");

const app = express();
const PORT = 5000;

app.use(express.static(path.join(__dirname, "index.html")));

// Função para parsear estatísticas do Instagram
function parseDescricao(descricao) {
  const regex = /([\d,.]+)\sFollowers.*?([\d,.]+)\sFollowing.*?([\d,.]+)\sPosts/i;
  const match = descricao?.match(regex);
  if (match) {
    const normalize = (n) => parseInt(n.replace(/[,.]/g, ""));
    return {
      seguidores: normalize(match[1]),
      seguindo: normalize(match[2]),
      posts: normalize(match[3]),
    };
  }
  return { seguidores: null, seguindo: null, posts: null };
}

// Função para pegar links do DuckDuckGo
async function buscarLinksInstagram(query) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}&kp=-1`;
  const { data } = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const $ = cheerio.load(data);

  const links = new Set();
  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const match = href.match(/uddg=([^&]+)/);
    const finalLink = match ? decodeURIComponent(match[1]) : href;
    if (finalLink.includes("instagram.com") && !finalLink.includes("/explore/")) {
      links.add(finalLink.split("?")[0]);
    }
  });
  return [...links];
}

// Rota de busca
app.get("/api/search", async (req, res) => {
  const tipo = req.query.tipo || "frevo";
  const cidade = req.query.cidade || "";
  const query = `instagram ${tipo} ${cidade}`;

  try {
    const links = await buscarLinksInstagram(query);

    const promises = links.map(async (link) => {
      try {
        const { data: htmlPerfil } = await axios.get(link, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });

        if (htmlPerfil.includes("content=\"Log in to Instagram\"")) return null;

        const $$ = cheerio.load(htmlPerfil);
        const descricao = $$("meta[property='og:description']").attr("content");
        const stats = parseDescricao(descricao);

        // Pegando posts recentes (até 5 imagens)
        const imagens = [];
        $$("meta[property='og:image']").each((_, el) => {
          const src = $$(el).attr("content");
          if (src && !imagens.includes(src)) imagens.push(src);
        });

        if (!imagens.length) return null; // Ignora perfis sem posts

        return {
          url: link,
          descricao,
          ...stats,
          recentes: imagens.slice(0, 5),
        };
      } catch {
        return null;
      }
    });

    const resultados = (await Promise.allSettled(promises))
      .map((r) => r.value)
      .filter(Boolean);

    res.json(resultados);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Backend rodando em http://localhost:${PORT}`));
