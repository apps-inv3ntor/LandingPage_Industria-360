(function () {
  "use strict";

  /* =================================================================
     0) TELEMETRIA (opcional, gratuita — Google Apps Script + Sheets)
     Cole aqui a URL /exec gerada ao implantar o apps_script_telemetria.gs
     como Web App. Enquanto estiver vazia, nada é enviado (sem erro).
     ================================================================= */

  const TELEMETRY_URL = "https://script.google.com/macros/s/AKfycbxM1pvmkJeExj4Y_yZw6eFmDVpD1rImOyW44FToHQMm2Zn2898t-THeKw4oIV87YNtb/exec";

  const TELEMETRY_SESSION_KEY = "i360_session_id";
  const TELEMETRY_GEO_KEY = "i360_geo";
  const TELEMETRY_TOKEN_KEY = "i360_token_used";
  let telemetryGeo = null;
  let telemetryToken = "";
  const pageLoadedAt = Date.now();

  function getSessionId() {
    let id = sessionStorage.getItem(TELEMETRY_SESSION_KEY);
    if (!id) {
      id = "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem(TELEMETRY_SESSION_KEY, id);
    }
    return id;
  }

  function sendTelemetry(evento, detalhe, tempoS) {
    if (!TELEMETRY_URL) return;
    const payload = {
      token: telemetryToken,
      session_id: getSessionId(),
      evento: evento,
      detalhe: detalhe || "",
      pais: telemetryGeo ? telemetryGeo.pais : "",
      regiao: telemetryGeo ? telemetryGeo.regiao : "",
      cidade: telemetryGeo ? telemetryGeo.cidade : "",
      tempo_s: tempoS || "",
    };
    try {
      // no-cors: não precisamos ler a resposta, só garantir que o Apps
      // Script recebeu e gravou a linha — evita ruído de CORS no console.
      // keepalive: garante que a requisição tenta terminar mesmo se o
      // visitante trocar de página logo em seguida.
      fetch(TELEMETRY_URL, {
        method: "POST",
        mode: "no-cors",
        keepalive: true,
        headers: { "Content-Type": "text/plain" }, // texto simples evita pre-flight OPTIONS
        body: JSON.stringify(payload),
      });
    } catch (err) { /* telemetria nunca deve quebrar a navegação do visitante */ }
  }

  function initGeoAndTrackPageView() {
    if (!TELEMETRY_URL) return;

    const cached = sessionStorage.getItem(TELEMETRY_GEO_KEY);
    if (cached) {
      telemetryGeo = JSON.parse(cached);
      sendTelemetry("page_view", location.pathname);
      return;
    }

    fetch("https://ipapi.co/json/")
      .then(function (r) { return r.json(); })
      .then(function (geo) {
        telemetryGeo = {
          pais: geo.country_name || "",
          regiao: geo.region || "",
          cidade: geo.city || "",
        };
        sessionStorage.setItem(TELEMETRY_GEO_KEY, JSON.stringify(telemetryGeo));
      })
      .catch(function () { telemetryGeo = { pais: "", regiao: "", cidade: "" }; })
      .finally(function () { sendTelemetry("page_view", location.pathname); });
  }

  // NÃO chamamos initGeoAndTrackPageView() aqui embaixo — o rastreamento
  // só começa depois que o token é validado (ver Seção 1, função unlock),
  // porque é o token que identifica qual empresa está acessando.

  // tempo de permanência — enviado quando o visitante sai/troca de aba,
  // via sendBeacon (mais confiável que fetch nesse momento específico)
  function sendDurationBeacon() {
    if (!TELEMETRY_URL) return;
    const tempoS = Math.round((Date.now() - pageLoadedAt) / 1000);
    const payload = {
      token: telemetryToken,
      session_id: getSessionId(),
      evento: "session_duration",
      detalhe: location.pathname,
      pais: telemetryGeo ? telemetryGeo.pais : "",
      regiao: telemetryGeo ? telemetryGeo.regiao : "",
      cidade: telemetryGeo ? telemetryGeo.cidade : "",
      tempo_s: tempoS,
    };
    try {
      navigator.sendBeacon(TELEMETRY_URL, new Blob([JSON.stringify(payload)], { type: "text/plain" }));
    } catch (err) { /* noop */ }
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") sendDurationBeacon();
  });
  window.addEventListener("pagehide", sendDurationBeacon);

  /* =================================================================
     1) VALIDAÇÃO DE TOKEN
     Formato: EMP-<base64(DDMMAA invertido)>
     Válido por 15 dias a partir da data codificada no token.
     Este é o MESMO algoritmo que o gerador privado (Python, offline)
     usa para criar os tokens — aqui só decodificamos e conferimos.
     ================================================================= */

  const TOKEN_VALIDITY_DAYS = 15;

  function decodeToken(rawToken) {
    const token = rawToken.trim();
    if (!token.startsWith("EMP-")) return null;

    const encoded = token.slice(4);
    let reversed;
    try {
      reversed = atob(encoded);
    } catch (e) {
      return null;
    }

    const ddmmaa = reversed.split("").reverse().join("");
    if (!/^\d{6}$/.test(ddmmaa)) return null;

    const dd = parseInt(ddmmaa.slice(0, 2), 10);
    const mm = parseInt(ddmmaa.slice(2, 4), 10);
    const yy = parseInt(ddmmaa.slice(4, 6), 10);

    const issued = new Date(2000 + yy, mm - 1, dd);
    if (isNaN(issued.getTime())) return null;

    return issued;
  }

  function isTokenValid(rawToken) {
    const issued = decodeToken(rawToken);
    if (!issued) return false;

    const now = new Date();
    const diffMs = now - issued;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    return diffDays >= -1 && diffDays <= TOKEN_VALIDITY_DAYS;
  }

  /* =================================================================
     2) GATE — tela de login
     ================================================================= */

  const gateForm = document.getElementById("gate-form");
  const gateInput = document.getElementById("gate-token");
  const gateError = document.getElementById("gate-error");
  const gateCard = document.querySelector(".gate-card");

  const SESSION_KEY = "i360_session_ok";

  function unlock(token) {
    document.body.classList.add("unlocked");
    sessionStorage.setItem(SESSION_KEY, "1");
    telemetryToken = token || "";
    sessionStorage.setItem(TELEMETRY_TOKEN_KEY, telemetryToken);
    initGeoAndTrackPageView();
  }

  function showError(message) {
    gateError.textContent = message;
    gateCard.classList.remove("shake");
    // força reflow para permitir repetir a animação
    void gateCard.offsetWidth;
    gateCard.classList.add("shake");
  }

  if (gateForm) {
    gateForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const value = gateInput.value;

      if (isTokenValid(value)) {
        gateError.textContent = "";
        unlock(value.trim());
      } else {
        showError("[ ERRO: CHAVE INVÁLIDA. VERIFIQUE SEU BRIEFING. ]");
        gateInput.value = "";
        gateInput.focus();
      }
    });
  }

  // Revalida a sessão a cada carregamento — se não houver token
  // validado nesta aba (sessionStorage), a tela de login volta a
  // aparecer mesmo que o usuário tenha salvo o link nos favoritos.
  window.addEventListener("DOMContentLoaded", function () {
    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      document.body.classList.add("unlocked");
      telemetryToken = sessionStorage.getItem(TELEMETRY_TOKEN_KEY) || "";
      initGeoAndTrackPageView();
    }
  });

  /* =================================================================
     3) PROTEÇÃO LEVE DE CONTEÚDO
     Bloqueia cópia de texto e menu de contexto. Não tenta bloquear
     DevTools, print screen ou impressão via força-bruta — apenas
     desencoraja cópia casual do texto da página. A camada real de
     proteção é o próprio gate de acesso acima.
     ================================================================= */

  document.body.classList.add("no-select");

  document.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });

  document.addEventListener("copy", function (e) {
    e.preventDefault();
  });

  document.addEventListener("dragstart", function (e) {
    e.preventDefault();
  });

  /* =================================================================
     4) PLAYER DE VÍDEO PROTEGIDO (YouTube IFrame API)
     controls:0 remove a barra nativa do YouTube, mas NÃO impede que o
     YouTube mostre, por conta própria, uma tela com avatar/nome do
     canal quando o vídeo está pausado, em buffer ou finalizado — isso
     não é configurável via API. Por isso usamos duas camadas nossas:
       - uma tarja fixa no topo (sempre visível, tocando ou pausado)
         que cobre fisicamente a área onde o YouTube desenha esse
         cabeçalho;
       - uma camada de cobertura total, visível sempre que o estado
         não for "tocando" (carregando, pausado, ou finalizado), com
         nosso próprio aviso e um clique para retomar.
     ================================================================= */

  const YT_PLAYERS = {};
  const videoPlayTracked = {};
  let ytApiReady = false;
  let ytApiRequested = false;
  const ytPendingBuilds = [];

  function loadYouTubeApi() {
    if (ytApiRequested) return;
    ytApiRequested = true;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }

  window.onYouTubeIframeAPIReady = function () {
    ytApiReady = true;
    ytPendingBuilds.forEach(function (build) { build(); });
    ytPendingBuilds.length = 0;
  };

  function setPlayPauseIcon(playerId, isPlaying) {
    const bar = document.querySelector('.custom-controls[data-controls-for="' + playerId + '"]');
    if (!bar) return;
    bar.querySelector(".icon-play").style.display = isPlaying ? "none" : "block";
    bar.querySelector(".icon-pause").style.display = isPlaying ? "block" : "none";
  }

  function setCover(playerId, mode) {
    // mode: "loading" | "paused" | "ended" | null (null = esconde a cobertura total,
    // mas a tarja do topo nunca é escondida — ela é permanente via CSS)
    const wrap = document.querySelector('.player[data-player-id="' + playerId + '"]');
    if (!wrap) return;
    const cover = wrap.querySelector(".yt-cover");
    const label = wrap.querySelector(".yt-cover-text");

    if (!mode) {
      wrap.classList.remove("yt-covered");
      return;
    }
    wrap.classList.add("yt-covered");
    if (label) {
      label.textContent =
        mode === "loading" ? "Carregando vídeo…" :
        mode === "ended" ? "Vídeo finalizado — clique para assistir de novo" :
        "Pausado — clique para continuar";
    }
    if (cover) cover.setAttribute("data-mode", mode);
  }

  function startProgressLoop(playerId) {
    const seek = document.querySelector('.cc-seek[data-seek-for="' + playerId + '"]');
    if (!seek) return;
    let dragging = false;

    seek.addEventListener("pointerdown", function () { dragging = true; });
    seek.addEventListener("pointerup", function () { dragging = false; });

    seek.addEventListener("change", function () {
      const player = YT_PLAYERS[playerId];
      if (!player || typeof player.getDuration !== "function") return;
      const duration = player.getDuration() || 0;
      if (!duration) return;
      player.seekTo(duration * (seek.value / 1000), true);
    });

    setInterval(function () {
      const player = YT_PLAYERS[playerId];
      if (!player || dragging || typeof player.getCurrentTime !== "function") return;
      const duration = player.getDuration();
      if (!duration) return;
      seek.value = Math.round((player.getCurrentTime() / duration) * 1000);
    }, 500);
  }

  function buildPlayer(playerId, videoId) {
    const target = document.getElementById("yt-target-" + playerId);
    if (!target) return;

    setCover(playerId, "loading");

    const player = new YT.Player(target, {
      videoId: videoId,
      playerVars: {
        autoplay: 1,
        controls: 0,        // remove 100% da barra nativa do YouTube
        disablekb: 1,        // sem atalhos de teclado do YouTube
        fs: 0,                // usamos nosso próprio botão de tela cheia
        mute: 1,               // essencial: navegadores bloqueiam autoplay com
                                // som, e o bloqueio deixava o player "parado" na
                                // tela de pausa nativa do YouTube (com nome do
                                // canal) em vez de tocar de fato. Sem áudio mesmo.
        modestbranding: 1,
        rel: 0,                // sem sugestões de outros canais ao terminar
        iv_load_policy: 3,      // sem anotações/cards
        cc_load_policy: 0,       // legenda desligada por padrão
        playsinline: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: function (e) {
          try { e.target.mute(); } catch (err) { /* noop */ }
          try { e.target.setPlaybackQuality("hd720"); } catch (err) { /* noop */ }
          e.target.playVideo();
        },
        onStateChange: function (e) {
          setPlayPauseIcon(playerId, e.data === YT.PlayerState.PLAYING);
          if (e.data === YT.PlayerState.PLAYING) {
            setCover(playerId, null);
            if (!videoPlayTracked[playerId]) {
              videoPlayTracked[playerId] = true;
              sendTelemetry("video_play", playerId);
            }
          } else if (e.data === YT.PlayerState.ENDED) {
            setCover(playerId, "ended");
            sendTelemetry("video_complete", playerId);
          } else if (e.data === YT.PlayerState.PAUSED) setCover(playerId, "paused");
          else if (e.data === YT.PlayerState.BUFFERING) setCover(playerId, "loading");
        },
      },
    });

    YT_PLAYERS[playerId] = player;
    startProgressLoop(playerId);
  }

  function togglePlayPause(playerId) {
    const player = YT_PLAYERS[playerId];
    if (!player || typeof player.getPlayerState !== "function") return;
    if (player.getPlayerState() === YT.PlayerState.PLAYING) player.pauseVideo();
    else player.playVideo();
  }

  document.querySelectorAll(".play-btn[data-youtube-id]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const wrap = btn.closest(".player");
      const playerId = btn.getAttribute("data-player-id");
      const videoId = btn.getAttribute("data-youtube-id");

      wrap.classList.add("is-playing");
      loadYouTubeApi();

      const build = function () { buildPlayer(playerId, videoId); };
      if (ytApiReady) build();
      else ytPendingBuilds.push(build);
    });
  });

  // escudo transparente sobre o vídeo: qualquer clique nele alterna
  // play/pause através da API — o iframe do YouTube em si nunca recebe
  // o clique (nem o hover), então nenhum ícone nativo dele aparece.
  document.querySelectorAll(".yt-shield").forEach(function (shield) {
    shield.addEventListener("click", function () {
      togglePlayPause(shield.getAttribute("data-shield-for"));
    });
  });

  // clicar na camada de cobertura (pausado/finalizado) retoma o vídeo,
  // sem nunca expor a tela nativa do YouTube por trás
  document.querySelectorAll(".yt-cover").forEach(function (cover) {
    cover.addEventListener("click", function () {
      const wrap = cover.closest(".player");
      const playerId = wrap ? wrap.getAttribute("data-player-id") : null;
      const player = YT_PLAYERS[playerId];
      if (!player || typeof player.getPlayerState !== "function") return;
      if (player.getPlayerState() === YT.PlayerState.ENDED) player.seekTo(0, true);
      player.playVideo();
    });
  });

  function setFullscreenIcon(bar, isFullscreen) {
    const expand = bar.querySelector(".icon-expand");
    const compress = bar.querySelector(".icon-compress");
    if (expand) expand.style.display = isFullscreen ? "none" : "block";
    if (compress) compress.style.display = isFullscreen ? "block" : "none";
  }

  document.querySelectorAll(".custom-controls").forEach(function (bar) {
    const playerId = bar.getAttribute("data-controls-for");

    const playBtn = bar.querySelector('[data-action="toggle-play"]');
    if (playBtn) {
      playBtn.addEventListener("click", function () {
        togglePlayPause(playerId);
      });
    }

    const fsBtn = bar.querySelector('[data-action="fullscreen"]');
    if (fsBtn) {
      fsBtn.addEventListener("click", function () {
        const wrap = bar.closest(".player");
        const current = document.fullscreenElement || document.webkitFullscreenElement;

        if (current === wrap) {
          // já está em tela cheia neste player -> sai (corrige o botão que
          // só expandia e nunca voltava)
          if (document.exitFullscreen) document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } else {
          if (wrap.requestFullscreen) wrap.requestFullscreen();
          else if (wrap.webkitRequestFullscreen) wrap.webkitRequestFullscreen();
        }
      });
    }

    ["fullscreenchange", "webkitfullscreenchange"].forEach(function (evt) {
      document.addEventListener(evt, function () {
        const wrap = bar.closest(".player");
        const current = document.fullscreenElement || document.webkitFullscreenElement;
        setFullscreenIcon(bar, current === wrap);
      });
    });

    bar.querySelectorAll(".cc-q-btn").forEach(function (qBtn) {
      qBtn.addEventListener("click", function () {
        const player = YT_PLAYERS[playerId];
        const quality = qBtn.getAttribute("data-quality");
        if (player && typeof player.setPlaybackQuality === "function") {
          try { player.setPlaybackQuality(quality); } catch (err) { /* noop */ }
        }
        bar.querySelectorAll(".cc-q-btn").forEach(function (b) { b.classList.remove("active"); });
        qBtn.classList.add("active");
      });
    });
  });


  // Bloqueia o menu de contexto na nossa própria interface ao redor do
  // player. IMPORTANTE — limitação técnica real: uma vez que o vídeo do
  // YouTube carrega dentro do iframe, o conteúdo dentro dele pertence a
  // outro domínio (youtube.com). Por política de segurança do navegador
  // (same-origin policy), nenhuma página pode interceptar cliques/menu
  // de contexto DENTRO de um iframe de outro domínio — isso não é uma
  // configuração que falta, é uma barreira do próprio navegador. A
  // única forma de eliminar 100% esse botão direito seria hospedar o
  // vídeo como arquivo próprio (<video>), fora do YouTube.
  document.querySelectorAll(".player").forEach(function (player) {
    player.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });
  });

  /* =================================================================
     5) FAQ — módulos recolhíveis
     ================================================================= */

  document.querySelectorAll(".faq-module-toggle").forEach(function (toggle) {
    toggle.addEventListener("click", function () {
      toggle.closest(".faq-module").classList.toggle("open");
      sendTelemetry("faq_module_open", toggle.textContent.trim());
    });
  });

  document.querySelectorAll(".faq-item").forEach(function (item) {
    item.addEventListener("toggle", function () {
      if (item.open) {
        const q = item.querySelector("summary");
        sendTelemetry("faq_question_open", q ? q.textContent.trim() : "");
      }
    });
  });

  /* =================================================================
     6) MÉTRICAS — abas por app
     ================================================================= */

  document.querySelectorAll(".metrics-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      const target = tab.getAttribute("data-target");

      document.querySelectorAll(".metrics-tab").forEach(function (t) {
        t.classList.remove("active");
      });
      document.querySelectorAll(".metrics-panel").forEach(function (p) {
        p.classList.remove("active");
      });

      tab.classList.add("active");
      document.getElementById(target).classList.add("active");
      sendTelemetry("metrics_tab_view", tab.textContent.trim());
    });
  });

  /* =================================================================
     7) WIDGET DE CHAT FLUTUANTE (Card 4 — contato por e-mail)
     Fluxo 100% simulado na interface + envio real via webhook do
     Make.com. Troque WEBHOOK_URL pela URL gerada no seu cenário
     do Make (módulo "Webhooks" → "Custom webhook").
     ================================================================= */

  const WEBHOOK_URL = "https://hook.us2.make.com/nnt4bqo787opnktqdu6e6xekiv7vjljf";

  const chatFab = document.getElementById("chat-fab");
  const chatWidget = document.getElementById("chat-widget");
  const chatClose = document.getElementById("chat-close");
  const chatForm = document.getElementById("chat-form");
  const chatBody = document.getElementById("chat-body");
  const chatIntro = document.getElementById("chat-intro");
  const chatDynamic = document.getElementById("chat-dynamic");

  let chatAutoCloseTimer = null;

  function resetChatWidget() {
    if (chatAutoCloseTimer) {
      clearTimeout(chatAutoCloseTimer);
      chatAutoCloseTimer = null;
    }
    if (chatIntro) chatIntro.style.display = "";
    if (chatDynamic) chatDynamic.innerHTML = "";
    if (chatForm) {
      chatForm.reset();
      chatForm.style.display = "";
      const submitBtn = chatForm.querySelector("button[type=submit]");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Enviar informações";
      }
    }
  }

  function openChat() {
    chatWidget.classList.add("open");
    chatFab.classList.add("hidden");
  }

  function closeChat() {
    chatWidget.classList.remove("open");
    chatFab.classList.remove("hidden");
    resetChatWidget(); // ao fechar, a próxima abertura já vem limpa
  }

  if (chatFab) chatFab.addEventListener("click", function () {
    sendTelemetry("contact_click", "card4_fab_icon");
    openChat();
  });
  if (chatClose) chatClose.addEventListener("click", closeChat);

  document.querySelectorAll('.contact-card a.btn[href*="wa.me"]').forEach(function (link) {
    link.addEventListener("click", function () {
      sendTelemetry("contact_click", "whatsapp: " + link.textContent.trim());
    });
  });

  document.querySelectorAll("[data-open-chat]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      sendTelemetry("contact_click", "card4_email_open");
      openChat();
    });
  });

  if (chatForm) {
    chatForm.addEventListener("submit", async function (e) {
      e.preventDefault();

      // honeypot: se esse campo (invisível para humanos) vier preenchido,
      // é bot — finge sucesso e não gasta 1 crédito sequer do Make.com
      if (chatForm.website && chatForm.website.value.trim() !== "") {
        if (chatIntro) chatIntro.style.display = "none";
        chatForm.style.display = "none";
        chatDynamic.innerHTML = "";
        const fakeSuccess = document.createElement("div");
        fakeSuccess.className = "chat-msg";
        fakeSuccess.textContent =
          "Obrigado pelas informações! Assim que eu receber o seu contato aqui na minha caixa de entrada, analisarei o seu cenário e retornarei o mais breve possível para conversarmos. Tenha um excelente dia de trabalho!";
        chatDynamic.appendChild(fakeSuccess);
        chatAutoCloseTimer = setTimeout(closeChat, 4000);
        return;
      }

      const submitBtn = chatForm.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      submitBtn.textContent = "TRANSMITINDO DADOS DE AUTORIZAÇÃO...";

      const payload = {
        nome: chatForm.nome.value,
        empresa: chatForm.empresa.value,
        email: chatForm.email.value,
        motivo: chatForm.motivo.value,
        origem: "card4_chat_widget",
        data: new Date().toISOString(),
      };

      try {
        if (WEBHOOK_URL) {
          await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }

        // sucesso: mostra só a mensagem final (esconde as de boas-vindas
        // e o formulário) — nada de empilhar mensagem em cima de mensagem
        if (chatIntro) chatIntro.style.display = "none";
        chatForm.style.display = "none";
        chatDynamic.innerHTML = "";
        const success = document.createElement("div");
        success.className = "chat-msg";
        success.textContent =
          "Obrigado pelas informações! Assim que eu receber o seu contato aqui na minha caixa de entrada, analisarei o seu cenário e retornarei o mais breve possível para conversarmos. Tenha um excelente dia de trabalho!";
        chatDynamic.appendChild(success);
        chatBody.scrollTop = chatBody.scrollHeight;

        // fecha sozinho depois de alguns segundos, já deixando tudo
        // resetado para a próxima vez que o ícone for clicado
        chatAutoCloseTimer = setTimeout(closeChat, 4000);
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Enviar informações";
        chatDynamic.innerHTML = "";
        const errorMsg = document.createElement("div");
        errorMsg.className = "chat-msg";
        errorMsg.style.color = "var(--orange)";
        errorMsg.textContent =
          "[ FALHA NA TRANSMISSÃO. VERIFIQUE SUA CONEXÃO E TENTE NOVAMENTE. ]";
        chatDynamic.appendChild(errorMsg);
        chatBody.scrollTop = chatBody.scrollHeight;
      }
    });
  }
})();
