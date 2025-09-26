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
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code
      })
    });

    const data = await tokenRes.json();
    if (data.error || !data.access_token) {
      return res
        .status(401)
        .send(`<pre>OAuth error: ${data.error || "no_access_token"}</pre>`);
    }

    const payload = JSON.stringify({ token: data.access_token, provider: "github" });
    const ADMIN_URL = "https://correioolindense.com.br/admin/";   // seu painel

    const html = `<!doctype html>
<html>
  <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height:1.4; padding:16px;">
    <div id="msg">Finalizando autorização…</div>
    <script>
      (function () {
        var sent = false;
        var message = 'authorization:github:success:${payload}';
        var ADMIN_URL = '${ADMIN_URL}';

        function trySendToOpener() {
          try {
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage(message, '*');
              sent = true;
              window.close();
            }
          } catch (e) {}
        }

        function tryOpenAdminAndSend() {
          try {
            // Abre (ou foca) o /admin em uma janela nomeada
            var w = window.open(ADMIN_URL, 'decap-admin');
            if (!w) return false; // popup bloqueado
            // Tenta enviar várias vezes até o admin carregar e ouvir
            var attempts = 0;
            var timer = setInterval(function () {
              attempts++;
              try {
                w.postMessage(message, '*');
                sent = true;
                clearInterval(timer);
                window.close();
              } catch (e) {}
              if (attempts > 30) { // ~6s (30 x 200ms)
                clearInterval(timer);
                if (!sent) {
                  document.getElementById('msg').innerHTML =
                    'Authorization complete, mas não foi possível entregar o login ao painel.<br>' +
                    'Por favor, <b>permita pop-ups</b> para este site e tente novamente.';
                }
              }
            }, 200);
            return true;
          } catch (e) { return false; }
        }

        // 1) fluxo normal: enviar ao opener e fechar
        [0, 50, 100, 200, 400, 800].forEach(function(t){ setTimeout(trySendToOpener, t); });

        // 2) fallback: se em ~1s não conseguiu, abre/foca o /admin e tenta por lá
        setTimeout(function(){
          if (!sent) {
            document.getElementById('msg').textContent =
              'Quase lá… abrindo o painel para finalizar o login.';
            var opened = tryOpenAdminAndSend();
            if (!opened) {
              document.getElementById('msg').innerHTML =
                'Authorization complete, mas o navegador bloqueou pop-ups.<br>' +
                'Volte para <b>${ADMIN_URL}</b>, permita pop-ups e tente novamente.';
            }
          }
        }, 1000);
      })();
    </script>
  </body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (e) {
    res.status(500).send('<pre>Callback error: ' + String(e) + '</pre>');
  }
});

// 4) Sobe o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OAuth provider rodando na porta ${PORT}`));