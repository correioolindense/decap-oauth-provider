import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// Libere o domínio do seu site e, se quiser, o github.io:
const ALLOWED_ORIGINS = [
  "https://correioolindense.com.br",
  "https://correioolindense.github.io"
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, true); // relaxado para testes; depois restrinja
  }
}));

const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = process.env;

app.get("/", (_, res) => res.send("Decap OAuth Provider OK"));

app.get("/auth", (req, res) => {
  const redirectUri = `${req.protocol}://${req.get("host")}/callback`;
  const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo,user&redirect_uri=${encodeURIComponent(redirectUri)}`;
  res.redirect(url);
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).json({ error: "missing_code" });

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Accept": "application/json" },
    body: new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code
    })
  });
  const data = await tokenRes.json();
  if (data.error) return res.status(401).json(data);

  res.json({ token: data.access_token, provider: "github" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OAuth provider na porta ${PORT}`));
