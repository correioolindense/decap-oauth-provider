import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// Render fica atrás de proxy
app.set("trust proxy", 1);

// Domínios que podem abrir o /admin
const ALLOWED_ORIGINS = [
  "https://correioolindense.com.br",
  "https://correioolindense.github.io"
];
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin))
}));

const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, CALLBACK_URL } = process.env;

// 1) Health check para o Render
app.get("/health", (_, res) => res.status(200).send("ok"));
app.get("/", (_, res) => res.send("Decap OAuth Provider OK"));

// 2) /auth -> redireciona para o GitHub com redirect_uri HTTPS
app.get("/auth", (req, res) => {
  try {
    const host = req.get("host");
    const redirectUri = CALLBACK_URL || `https://${host}/callback`;

    // aceita provider/site_id/qualquer query sem depender delas
    const url =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${encodeURIComponent(GITHUB_CLIENT_ID)}` +
      `&scope=${encodeURIComponent("repo,user")}` +
      `&allow_signup=false` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`;

    res.redirect(url);
  } catch (e) {
    res
      .status(500)
      .send(`<pre>Auth error: ${String(e)}</pre>`);
  }
});

// 3) /callback -> troca code por token e devolve HTML que faz postMessage
app.get("/callback", async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send("missing_code");

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
    if (data.error || !data.access_token) {
      return res
        .status(401)
        .send(`<pre>OAuth error: ${data.error || "no_access_token"}</pre>`);
    }

    const payload = JSON.stringify({
      token: data.access_token,
      provider: "github"
    });

    const html = `
<!doctype html>
<html>
  <body>
    <script>
      (function() {
        // Envia o token pro /admin e fecha o popup
        function send() {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage('authorization:github:success:${payload}', '*');
            window.close();
          } else {
            document.body.innerText = 'Authorization complete. You can close this window.';
          }
        }
        send();
        setTimeout(send, 100);
        setTimeout(send, 500);
      })();
    </script>
  </body>
</html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (e) {
    res
      .status(500)
      .send(`<pre>Callback error: ${String(e)}</pre>`);
  }
});

// 4) Sobe o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OAuth provider rodando na porta ${PORT}`));