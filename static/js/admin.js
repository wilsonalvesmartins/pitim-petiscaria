/* ========================================================
   PITIM PETISCARIA - ADMIN & REMOTE CONTROL CONTROLLER
   ======================================================== */

let ws = null;
let isPlaying = true;

document.addEventListener("DOMContentLoaded", () => {
  initLogin();
  initTabs();
  initPlayerControls();
  initQueue();
  initAds();
  initSettings();
  initWebSocket();
  loadInitialData();
});

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// --- LOGIN ---
function initLogin() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = document.getElementById("username").value;
    const pass = document.getElementById("password").value;
    const errEl = document.getElementById("loginError");
    const btn = document.getElementById("loginSubmitBtn");

    errEl.textContent = "";
    btn.disabled = true;

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        window.location.reload();
      } else {
        errEl.textContent = data.message || "Erro ao realizar login";
      }
    } catch (err) {
      errEl.textContent = "Erro de conexão com o servidor.";
    } finally {
      btn.disabled = false;
    }
  });
}

// --- LOGOUT & TABS ---
function initTabs() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.reload();
    });
  }

  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));

      btn.classList.add("active");
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add("active");
    });
  });
}

// --- INITIAL DATA LOAD ---
async function loadInitialData() {
  try {
    const res = await fetch("/api/state");
    if (res.ok) {
      const data = await res.json();
      updatePlayerUI(data.current_video);
      updateQueueUI(data.queue);
      updateAdsUI(data.ads);
      if (data.playback_state) {
        isPlaying = data.playback_state.isPlaying;
        updatePlayPauseButton(isPlaying);
        if (typeof data.playback_state.volume === "number") {
          const slider = document.getElementById("volSlider");
          const label = document.getElementById("volLabel");
          if (slider) slider.value = data.playback_state.volume;
          if (label) label.textContent = `${data.playback_state.volume}%`;
        }
      }
    }
  } catch (err) {
    console.error("Erro ao carregar dados:", err);
  }
}

// --- PLAYER CONTROLS ---
function initPlayerControls() {
  const skipBtn = document.getElementById("skipBtn");
  const playPauseBtn = document.getElementById("playPauseBtn");
  const volSlider = document.getElementById("volSlider");
  const volLabel = document.getElementById("volLabel");

  if (skipBtn) {
    skipBtn.addEventListener("click", async () => {
      skipBtn.disabled = true;
      try {
        const res = await fetch("/api/player/skip", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          showToast("⏭️ Música pulada com sucesso!");
        }
      } catch (e) {
        showToast("Erro ao pular música", "error");
      } finally {
        setTimeout(() => { skipBtn.disabled = false; }, 800);
      }
    });
  }

  if (playPauseBtn) {
    playPauseBtn.addEventListener("click", async () => {
      isPlaying = !isPlaying;
      updatePlayPauseButton(isPlaying);
      await fetch("/api/player/play-pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPlaying: isPlaying })
      });
    });
  }

  if (volSlider) {
    volSlider.addEventListener("input", (e) => {
      const val = e.target.value;
      if (volLabel) volLabel.textContent = `${val}%`;
    });

    volSlider.addEventListener("change", async (e) => {
      const val = parseInt(e.target.value);
      await fetch("/api/player/volume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volume: val })
      });
      showToast(`🔊 Volume ajustado para ${val}%`);
    });
  }
}

function updatePlayPauseButton(playing) {
  const icon = document.getElementById("playPauseIcon");
  const text = document.getElementById("playPauseText");
  if (!icon || !text) return;
  if (playing) {
    icon.textContent = "⏸️";
    text.textContent = "Pausar";
  } else {
    icon.textContent = "▶️";
    text.textContent = "Retomar";
  }
}

function updatePlayerUI(video) {
  const titleEl = document.getElementById("npTitle");
  const authorEl = document.getElementById("npAuthor");
  const thumbEl = document.getElementById("npThumb");

  if (!titleEl) return;

  if (video) {
    titleEl.textContent = video.title || "Música no YouTube";
    authorEl.textContent = video.author || "YouTube";
    if (thumbEl && video.thumbnail) thumbEl.src = video.thumbnail;
  } else {
    titleEl.textContent = "Playlist Ambiente da Petiscaria";
    authorEl.textContent = "Pitim Petiscaria";
    if (thumbEl) thumbEl.src = "/static/img/sample_ad.jpg";
  }
}

// --- QUEUE MANAGEMENT ---
function initQueue() {
  const form = document.getElementById("addQueueForm");
  const clearBtn = document.getElementById("clearQueueBtn");

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("youtubeUrl");
      const btn = document.getElementById("addQueueBtn");
      const url = input.value.trim();
      if (!url) return;

      btn.disabled = true;
      btn.textContent = "Buscando...";

      try {
        const res = await fetch("/api/queue/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          input.value = "";
          showToast(`🎵 "${data.item.title}" adicionado à fila!`);
          updateQueueUI(data.queue);
        } else {
          showToast(data.detail || "Erro ao adicionar link do YouTube", "error");
        }
      } catch (err) {
        showToast("Erro de conexão ao adicionar vídeo", "error");
      } finally {
        btn.disabled = false;
        btn.innerHTML = "<span>Adicionar à Fila</span>";
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      if (confirm("Deseja realmente limpar toda a fila de músicas?")) {
        await fetch("/api/queue/clear", { method: "POST" });
        showToast("Fila limpa com sucesso!");
      }
    });
  }
}

function updateQueueUI(queue) {
  const list = document.getElementById("queueList");
  const countEl = document.getElementById("queueCount");
  const clearBtn = document.getElementById("clearQueueBtn");

  if (!list) return;

  const items = queue || [];
  if (countEl) countEl.textContent = items.length;
  if (clearBtn) clearBtn.style.display = items.length > 0 ? "inline-block" : "none";

  if (items.length === 0) {
    list.innerHTML = `
      <div class="empty-queue-msg">
        <span>🎵 A fila está vazia. A TV está tocando a playlist ambiente da casa.</span>
      </div>
    `;
    return;
  }

  list.innerHTML = "";
  items.forEach((item, idx) => {
    const el = document.createElement("div");
    el.className = "queue-item";
    el.innerHTML = `
      <span class="queue-index">#${idx + 1}</span>
      <img src="${item.thumbnail || '/static/img/sample_ad.jpg'}" class="queue-thumb" alt="Thumbnail">
      <div class="queue-info">
        <div class="queue-title" title="${item.title}">${item.title}</div>
        <div class="queue-author">${item.author || 'YouTube'}</div>
      </div>
      <button class="btn btn-text-danger btn-sm" onclick="removeFromQueue('${item.id}')" title="Remover da fila">✕</button>
    `;
    list.appendChild(el);
  });
}

window.removeFromQueue = async function(id) {
  try {
    const res = await fetch("/api/queue/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Item removido da fila");
      updateQueueUI(data.queue);
    }
  } catch (e) {
    showToast("Erro ao remover item", "error");
  }
};

// --- ADS MANAGEMENT ---
function initAds() {
  const form = document.getElementById("uploadAdForm");
  const fileInput = document.getElementById("adFile");
  const durationGroup = document.getElementById("durationGroup");

  if (fileInput && durationGroup) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (file && file.type.startsWith("video/")) {
        durationGroup.style.opacity = "0.5";
        durationGroup.querySelector("input").disabled = true;
      } else {
        durationGroup.style.opacity = "1";
        durationGroup.querySelector("input").disabled = false;
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const file = fileInput.files[0];
      if (!file) return;

      const title = document.getElementById("adTitle").value;
      const duration = document.getElementById("adDuration").value;
      const btn = document.getElementById("uploadAdBtn");
      const progressBox = document.getElementById("uploadProgressBar");
      const progressFill = document.getElementById("uploadProgressFill");

      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title);
      fd.append("duration", duration);

      btn.disabled = true;
      progressBox.style.display = "block";
      progressFill.style.width = "40%";

      try {
        const res = await fetch("/api/ads/upload", {
          method: "POST",
          body: fd
        });
        progressFill.style.width = "100%";
        const data = await res.json();
        if (res.ok && data.success) {
          form.reset();
          showToast("📢 Propaganda enviada com sucesso!");
          // Reload ads
          const stateRes = await fetch("/api/state");
          const stateData = await stateRes.json();
          updateAdsUI(stateData.ads);
        } else {
          showToast(data.detail || "Erro ao enviar arquivo", "error");
        }
      } catch (err) {
        showToast("Erro de conexão no upload", "error");
      } finally {
        btn.disabled = false;
        setTimeout(() => { progressBox.style.display = "none"; }, 500);
      }
    });
  }
}

function updateAdsUI(ads) {
  const grid = document.getElementById("adsGrid");
  const countEl = document.getElementById("adsCount");
  if (!grid) return;

  const items = ads || [];
  if (countEl) countEl.textContent = items.length;

  grid.innerHTML = "";
  if (items.length === 0) {
    grid.innerHTML = "<p style='color: var(--text-muted); padding: 12px;'>Nenhuma propaganda cadastrada.</p>";
    return;
  }

  items.forEach(ad => {
    const card = document.createElement("div");
    card.className = "ad-card-item";

    let mediaTag = "";
    if (ad.type === "video") {
      mediaTag = `<video src="${ad.url}" muted preload="metadata"></video>`;
    } else {
      mediaTag = `<img src="${ad.url}" alt="${ad.title}">`;
    }

    card.innerHTML = `
      <div class="ad-thumb-box">
        ${mediaTag}
        <span class="ad-type-badge">${ad.type === 'video' ? '🎬 VÍDEO' : '🖼️ FOTO'}</span>
      </div>
      <div class="ad-details">
        <div class="ad-item-title" title="${ad.title}">${ad.title}</div>
        <div class="ad-item-meta">
          <span>${ad.type === 'video' ? 'Tempo do vídeo' : `${ad.duration || 10}s de exibição`}</span>
          <span style="color: ${ad.active ? '#00e676' : '#f44336'}; font-weight: 700;">
            ${ad.active ? '● Ativo' : '○ Pausado'}
          </span>
        </div>
        <div class="ad-actions">
          <button class="btn btn-outline btn-sm flex-1" onclick="toggleAd('${ad.id}', ${!ad.active})">
            ${ad.active ? 'Pausar' : 'Ativar'}
          </button>
          <button class="btn btn-text-danger btn-sm" onclick="deleteAd('${ad.id}')" title="Excluir">
            🗑️
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

window.toggleAd = async function(id, active) {
  try {
    await fetch(`/api/ads/${id}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: active })
    });
    showToast(active ? "Propaganda ativada" : "Propaganda pausada");
    const stateRes = await fetch("/api/state");
    const stateData = await stateRes.json();
    updateAdsUI(stateData.ads);
  } catch (e) {
    showToast("Erro ao alterar propaganda", "error");
  }
};

window.deleteAd = async function(id) {
  if (confirm("Tem certeza que deseja apagar essa propaganda do servidor?")) {
    try {
      await fetch(`/api/ads/${id}`, { method: "DELETE" });
      showToast("Propaganda excluída!");
      const stateRes = await fetch("/api/state");
      const stateData = await stateRes.json();
      updateAdsUI(stateData.ads);
    } catch (e) {
      showToast("Erro ao excluir propaganda", "error");
    }
  }
};

// --- SETTINGS ---
function initSettings() {
  const form = document.getElementById("settingsForm");
  const qrInput = document.getElementById("qrUrl");
  const qrPreview = document.getElementById("settingsQrPreview");

  if (qrInput && qrPreview) {
    qrInput.addEventListener("change", () => {
      // Refresh preview
      qrPreview.src = `/api/qrcode?t=${Date.now()}`;
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("saveSettingsBtn");
      btn.disabled = true;

      const payload = {
        qr_url: document.getElementById("qrUrl").value.trim(),
        qr_text: document.getElementById("qrText").value.trim(),
        ticker_text: document.getElementById("tickerText").value.trim(),
        default_playlist_id: document.getElementById("defaultPlaylist").value.trim(),
        admin_pass: document.getElementById("newAdminPass").value.trim()
      };

      try {
        const res = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          showToast("💾 Configurações salvas e atualizadas na TV!");
          if (qrPreview) qrPreview.src = `/api/qrcode?t=${Date.now()}`;
          document.getElementById("newAdminPass").value = "";
        } else {
          showToast("Erro ao salvar configurações", "error");
        }
      } catch (err) {
        showToast("Erro de conexão", "error");
      } finally {
        btn.disabled = false;
      }
    });
  }
}

// --- WEBSOCKET CLIENT ---
function initWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    const badge = document.getElementById("tvStatusBadge");
    if (badge) {
      badge.className = "tv-status-badge online";
      badge.querySelector("span:last-child").textContent = "TV Online";
    }
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "QUEUE_UPDATED") {
        updateQueueUI(msg.queue);
        updatePlayerUI(msg.current_video);
      } else if (msg.type === "NOW_PLAYING_SYNC") {
        updatePlayerUI(msg.video);
      } else if (msg.type === "ADS_UPDATED") {
        updateAdsUI(msg.ads);
      } else if (msg.type === "PLAY_STATE") {
        isPlaying = msg.isPlaying;
        updatePlayPauseButton(isPlaying);
      }
    } catch (e) {}
  };

  ws.onclose = () => {
    const badge = document.getElementById("tvStatusBadge");
    if (badge) {
      badge.className = "tv-status-badge offline";
      badge.querySelector("span:last-child").textContent = "Desconectado";
    }
    setTimeout(initWebSocket, 3000);
  };
}
