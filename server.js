import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// atrás de proxy (Render)
app.set("trust proxy", 1);

// domínios permitidos a abrir o popup de login
const ALLOWED_ORIGINS = [
  "https://correioolindense.com.br",
  "https://correioolindense.github.io"
];
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin))
}));

const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = process.env;

app.get("/", (_, res) => res.send("Decap OAuth Provider OK"));

app.get("/auth", (req, res) => {
  // use sempre HTTPS no callback do Render ou defina CALLBACK_URL nas env vars
  const host = req.get("host");
  const redirectUri = process.env.CALLBACK_URL || `https://${host}/callback`;
  const url =
    `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}` +
    `&scope=repo,user&allow_signup=false&redirect_uri=${encodeURIComponent(redirectUri)}`;
  res.redirect(url);
});

app.get("/callback", async (req, res) => {
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
    return res.status(401).send(`OAuth error: ${data.error || "no_access_token"}`);
  }

  // o Decap espera esse postMessage e que o popup feche sozinho
  const payload = JSON.stringify({ token: data.access_token, provider: "github" });
  const html = `
<!doctype html>
<html>
  <body>
    <script>
      (function() {
        function send() {
          if (window.opener) {
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
});

// >>> sem isso o Render mata o processo, porque nada está ouvindo porta
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OAuth provider rodando na porta ${PORT}`));