/* ========================================================
   PITIM PETISCARIA & ESPETOS - TV DISPLAY CONTROLLER
   ======================================================== */

// --- GLOBAL STATE ---
let ytPlayer = null;
let isPlayerReady = false;
let adsList = [];
let currentAdIndex = 0;
let adTimer = null;
let adProgressInterval = null;
let ws = null;
let defaultPlaylistId = "PL4fGSIFgk8UkS8f_yO_e1Wj2iFvPZ6n8G";
let isHandlingEnd = false;

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
  initClock();
  initEmbers();
  initFullscreen();
  fetchInitialState();
  initWebSocket();
});

// --- DIGITAL CLOCK ---
function initClock() {
  const clockEl = document.getElementById("tvClock");
  function update() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString("pt-BR", { hour12: false });
  }
  update();
  setInterval(update, 1000);
}

// --- EMBER PARTICLES ---
function initEmbers() {
  const container = document.getElementById("embers");
  const count = 15;
  for (let i = 0; i < count; i++) {
    createEmber(container);
  }
}

function createEmber(container) {
  const ember = document.createElement("div");
  ember.className = "ember";
  const size = Math.random() * 5 + 3;
  ember.style.width = `${size}px`;
  ember.style.height = `${size}px`;
  ember.style.left = `${Math.random() * 100}%`;
  
  const duration = Math.random() * 8 + 6;
  ember.style.animationDuration = `${duration}s`;
  ember.style.animationDelay = `${Math.random() * 5}s`;
  ember.style.setProperty("--drift", `${(Math.random() - 0.5) * 120}px`);
  
  container.appendChild(ember);
}

// --- FULLSCREEN ---
function initFullscreen() {
  const btn = document.getElementById("fullscreenBtn");
  btn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.log(err));
    } else {
      document.exitFullscreen().catch(err => console.log(err));
    }
  });

  document.body.addEventListener("dblclick", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.log(err));
    }
  });
}

// --- FETCH INITIAL STATE ---
async function fetchInitialState() {
  try {
    const res = await fetch("/api/state");
    if (res.ok) {
      const data = await res.json();
      if (data.settings && data.settings.default_playlist_id) {
        defaultPlaylistId = data.settings.default_playlist_id;
      }
      if (data.ads && data.ads.length > 0) {
        adsList = data.ads;
      } else {
        adsList = [{
          id: "default",
          type: "image",
          url: "/static/img/sample_ad.jpg",
          duration: 12,
          title: "Pitim Petiscaria"
        }];
      }
      renderAd(0);
      
      // Update UI elements
      if (data.settings) {
        updateSettingsUI(data.settings);
      }
    }
  } catch (err) {
    console.error("Erro ao carregar estado inicial:", err);
  }
}

// --- ADS CAROUSEL SYSTEM ---
function renderAd(index) {
  if (adsList.length === 0) return;
  if (index >= adsList.length) index = 0;
  currentAdIndex = index;

  const counterEl = document.getElementById("adSlideCounter");
  counterEl.textContent = `${index + 1} / ${adsList.length}`;

  const ad = adsList[index];
  const wrapper = document.getElementById("adMediaWrapper");
  const progressFill = document.getElementById("adProgressFill");

  // Reset timers
  clearTimeout(adTimer);
  clearInterval(adProgressInterval);
  progressFill.style.width = "0%";

  wrapper.innerHTML = "";

  if (ad.type === "video") {
    const video = document.createElement("video");
    video.className = "ad-media-item active";
    video.src = ad.url;
    video.autoplay = true;
    video.muted = true; // Video ads play muted on TV so music continues!
    video.playsInline = true;
    wrapper.appendChild(video);

    // Track video progress
    video.addEventListener("timeupdate", () => {
      if (video.duration) {
        const pct = (video.currentTime / video.duration) * 100;
        progressFill.style.width = `${pct}%`;
      }
    });

    video.addEventListener("ended", () => {
      nextAd();
    });

    video.addEventListener("error", () => {
      console.warn("Erro no vídeo da propaganda, avançando...");
      setTimeout(nextAd, 2000);
    });

    video.play().catch(e => {
      console.warn("Autoplay bloqueado no vídeo da propaganda:", e);
      setTimeout(nextAd, (ad.duration || 10) * 1000);
    });

  } else {
    // Image ad
    const img = document.createElement("img");
    img.className = "ad-media-item active";
    img.src = ad.url;
    img.alt = ad.title || "Propaganda Pitim";
    wrapper.appendChild(img);

    const durationSec = Math.max(3, ad.duration || 10);
    const durationMs = durationSec * 1000;
    const startTime = Date.now();

    adProgressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / durationMs) * 100);
      progressFill.style.width = `${pct}%`;
    }, 100);

    adTimer = setTimeout(() => {
      clearInterval(adProgressInterval);
      nextAd();
    }, durationMs);
  }
}

function nextAd() {
  if (adsList.length <= 1) {
    // If only 1 ad, re-render it to restart video or timer
    renderAd(0);
    return;
  }
  const nextIdx = (currentAdIndex + 1) % adsList.length;
  renderAd(nextIdx);
}

// --- YOUTUBE PLAYER INTEGRATION ---
function onYouTubeIframeAPIReady() {
  ytPlayer = new YT.Player("youtubePlayer", {
    height: "100%",
    width: "100%",
    playerVars: {
      autoplay: 1,
      controls: 1,
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      enablejsapi: 1,
      iv_load_policy: 3,
      origin: window.location.origin
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
      onError: onPlayerError
    }
  });
}

function onPlayerReady(event) {
  isPlayerReady = true;
  console.log("YouTube Player Pronto!");
  
  // Set default volume
  ytPlayer.setVolume(85);

  // Check if we have a current queued video to play
  fetch("/api/state")
    .then(r => r.json())
    .then(state => {
      if (state.current_video && state.current_video.videoId) {
        playVideoById(state.current_video.videoId, state.current_video.title);
      } else if (state.queue && state.queue.length > 0) {
        // Pop next
        requestNextVideo();
      } else {
        // Play fallback playlist
        playFallbackPlaylist();
      }
    })
    .catch(() => playFallbackPlaylist());

  // Listen to unmute button
  const unmuteOverlay = document.getElementById("unmuteOverlay");
  const unmuteBtn = document.getElementById("unmuteBtn");
  
  unmuteBtn.addEventListener("click", () => {
    if (ytPlayer && ytPlayer.unMute) {
      ytPlayer.unMute();
      ytPlayer.setVolume(85);
      unmuteOverlay.style.display = "none";
    }
  });
}

function onPlayerStateChange(event) {
  const pillTitle = document.getElementById("nowPlayingTitle");
  
  if (event.data === YT.PlayerState.PLAYING) {
    isHandlingEnd = false;
    try {
      const data = ytPlayer.getVideoData();
      if (data && data.title) {
        pillTitle.textContent = data.title;
        // Notify server
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "TV_NOW_PLAYING",
            video: {
              videoId: data.video_id,
              title: data.title,
              author: data.author
            }
          }));
        }
      }
    } catch (e) {}

    // Check if player is muted
    if (ytPlayer.isMuted()) {
      document.getElementById("unmuteOverlay").style.display = "flex";
    } else {
      document.getElementById("unmuteOverlay").style.display = "none";
    }

  } else if (event.data === YT.PlayerState.ENDED) {
    if (!isHandlingEnd) {
      isHandlingEnd = true;
      console.log("Vídeo finalizado! Solicitando próximo...");
      requestNextVideo();
    }
  }
}

function onPlayerError(event) {
  console.warn("Erro no player do YouTube (código: " + event.data + "). Pulando para o próximo...");
  setTimeout(requestNextVideo, 1500);
}

function playVideoById(videoId, title) {
  if (!isPlayerReady || !ytPlayer) return;
  const pillTitle = document.getElementById("nowPlayingTitle");
  if (title) pillTitle.textContent = title;
  ytPlayer.loadVideoById({
    videoId: videoId,
    suggestedQuality: "hd720"
  });
}

function playFallbackPlaylist() {
  if (!isPlayerReady || !ytPlayer) return;
  const pillTitle = document.getElementById("nowPlayingTitle");
  pillTitle.textContent = "Playlist Ambiente Pitim";
  ytPlayer.loadPlaylist({
    list: defaultPlaylistId,
    listType: "playlist",
    suggestedQuality: "hd720"
  });
  ytPlayer.setLoop(true);
}

function requestNextVideo() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "TV_VIDEO_ENDED" }));
  } else {
    // Fallback: call API
    fetch("/api/player/skip", { method: "POST" })
      .then(r => r.json())
      .then(d => {
        if (d.next_video) {
          playVideoById(d.next_video.videoId, d.next_video.title);
        } else {
          playFallbackPlaylist();
        }
      })
      .catch(() => playFallbackPlaylist());
  }
}

// --- WEBSOCKET CLIENT ---
function initWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("🟢 Conectado ao WebSocket do Servidor Pitim!");
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg);
    } catch (err) {
      console.error("Erro ao processar mensagem WS:", err);
    }
  };

  ws.onclose = () => {
    console.warn("🔴 Desconectado do WebSocket. Reconectando em 3s...");
    setTimeout(initWebSocket, 3000);
  };

  ws.onerror = (err) => {
    console.error("Erro no WebSocket:", err);
  };
}

function handleServerMessage(msg) {
  console.log("Mensagem recebida do servidor:", msg.type);

  switch (msg.type) {
    case "INIT_STATE":
      if (msg.data.settings) updateSettingsUI(msg.data.settings);
      if (msg.data.ads && msg.data.ads.length > 0) {
        adsList = msg.data.ads;
      }
      break;

    case "PLAY_VIDEO":
      if (msg.video && msg.video.videoId) {
        playVideoById(msg.video.videoId, msg.video.title);
      } else {
        playFallbackPlaylist();
      }
      break;

    case "SKIP_VIDEO":
      if (msg.next_video && msg.next_video.videoId) {
        playVideoById(msg.next_video.videoId, msg.next_video.title);
      } else {
        playFallbackPlaylist();
      }
      break;

    case "PLAY_STATE":
      if (isPlayerReady && ytPlayer) {
        if (msg.isPlaying) {
          ytPlayer.playVideo();
        } else {
          ytPlayer.pauseVideo();
        }
      }
      break;

    case "SET_VOLUME":
      if (isPlayerReady && ytPlayer && typeof msg.volume === "number") {
        ytPlayer.setVolume(msg.volume);
        if (ytPlayer.isMuted()) ytPlayer.unMute();
      }
      break;

    case "ADS_UPDATED":
      if (msg.ads && msg.ads.length > 0) {
        adsList = msg.ads;
      } else {
        adsList = [{
          id: "default",
          type: "image",
          url: "/static/img/sample_ad.jpg",
          duration: 12,
          title: "Pitim Petiscaria"
        }];
      }
      renderAd(0);
      break;

    case "SETTINGS_UPDATED":
      updateSettingsUI(msg.settings);
      break;
  }
}

function updateSettingsUI(settings) {
  if (settings.qr_text) {
    document.getElementById("qrTitle").textContent = settings.qr_text;
  }
  if (settings.ticker_text) {
    document.getElementById("tickerContent").textContent = settings.ticker_text;
  }
  if (settings.default_playlist_id) {
    defaultPlaylistId = settings.default_playlist_id;
  }
  // Refresh QR code image
  const qrImg = document.getElementById("qrImage");
  qrImg.src = `/api/qrcode?t=${Date.now()}`;
}
