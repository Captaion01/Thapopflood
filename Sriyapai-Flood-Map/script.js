// Sriyapai Flood Map - local browser version
// ข้อมูลถูกเก็บใน Local Storage ของเบราว์เซอร์เครื่องนี้เท่านั้น

const STORAGE_KEY = "sriyapaiFloodReportsV1";
const SCHOOL_CENTER = [10.493, 99.18]; // จุดเริ่มต้นโดยประมาณ ปรับได้จากแผนที่
const LEVELS = {
  watch: { label: "เฝ้าระวัง", color: "#e5b323", className: "status-watch" },
  flood: { label: "น้ำท่วม", color: "#ee8734", className: "status-flood" },
  avoid: { label: "ควรหลีกเลี่ยง", color: "#d94b4b", className: "status-avoid" },
  clear: { label: "ปกติ / น้ำลด", color: "#20a56b", className: "status-clear" }
};

const map = L.map("map").setView(SCHOOL_CENTER, 16);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

let reports = loadReports();
let markers = {};
let selectedMarker = null;

const form = document.getElementById("reportForm");
const latInput = document.getElementById("lat");
const lngInput = document.getElementById("lng");
const photoInput = document.getElementById("photo");

function loadReports() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (error) {
    console.error("อ่านข้อมูลเดิมไม่สำเร็จ", error);
    return [];
  }
}

function saveReports() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
    return true;
  } catch (error) {
    showToast("บันทึกไม่สำเร็จ อาจมีรูปภาพขนาดใหญ่เกินไป");
    return false;
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function makeMarker(report) {
  const level = LEVELS[report.level] || LEVELS.watch;
  const marker = L.circleMarker([report.lat, report.lng], {
    radius: 9, color: "#ffffff", weight: 2, fillColor: level.color, fillOpacity: 1
  }).addTo(map);

  const depth = report.waterDepth !== "" && report.waterDepth != null
    ? `<br>ระดับน้ำ: ${escapeHtml(report.waterDepth)} ซม.` : "";
  const details = report.details
    ? `<br>${escapeHtml(report.details).replace(/\n/g, "<br>")}` : "";
  const image = report.photo ? `<img class="popup-image" src="${report.photo}" alt="ภาพรายงาน">` : "";

  marker.bindPopup(`
    <div class="popup-text">
      <div class="popup-title">${escapeHtml(report.placeName)}</div>
      <b>${level.label}</b>${depth}${details}
      <br><small>รายงานเมื่อ ${escapeHtml(report.createdAt)}</small>${image}
    </div>
  `);
  marker.on("click", () => highlightReport(report.id));
  markers[report.id] = marker;
}

function render() {
  Object.values(markers).forEach(marker => map.removeLayer(marker));
  markers = {};
  reports.forEach(makeMarker);
  document.getElementById("reportCount").textContent = reports.length;
  renderList();
}

function renderList() {
  const list = document.getElementById("reportList");
  if (!reports.length) {
    list.innerHTML = '<p class="empty-state">ยังไม่มีรายงาน ลองเพิ่มจุดแรกบนแผนที่ได้เลย</p>';
    return;
  }

  list.innerHTML = reports.slice().reverse().map(report => {
    const level = LEVELS[report.level] || LEVELS.watch;
    return `
      <article class="report-item">
        <div class="report-item-head">
          <strong>${escapeHtml(report.placeName)}</strong>
          <span class="status-pill ${level.className}">${level.label}</span>
        </div>
        <p>${escapeHtml(report.createdAt)}${report.waterDepth !== "" && report.waterDepth != null ? ` • น้ำประมาณ ${escapeHtml(report.waterDepth)} ซม.` : ""}</p>
        <div class="item-actions">
          <button type="button" data-action="show" data-id="${report.id}">ดูบนแผนที่</button>
          <button type="button" class="delete-btn" data-action="delete" data-id="${report.id}">ลบ</button>
        </div>
      </article>`;
  }).join("");
}

function highlightReport(id) {
  const marker = markers[id];
  if (!marker) return;
  map.setView(marker.getLatLng(), 18);
  marker.openPopup();
}

map.on("click", event => {
  latInput.value = event.latlng.lat.toFixed(6);
  lngInput.value = event.latlng.lng.toFixed(6);
  if (selectedMarker) map.removeLayer(selectedMarker);
  selectedMarker = L.circleMarker(event.latlng, {
    radius: 8, color: "#1769aa", weight: 2, fillColor: "#ffffff", fillOpacity: 1, dashArray: "4 3"
  }).addTo(map);
  showToast("เลือกตำแหน่งแล้ว กรอกรายละเอียดและกดบันทึก");
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  const placeName = document.getElementById("placeName").value.trim();
  const lat = Number(latInput.value);
  const lng = Number(lngInput.value);
  const level = document.getElementById("level").value;

  if (!placeName || !Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    showToast("กรุณากรอกชื่อสถานที่และพิกัดให้ถูกต้อง");
    return;
  }

  let photo = "";
  const file = photoInput.files[0];
  if (file) {
    if (!file.type.startsWith("image/")) {
      showToast("กรุณาเลือกไฟล์รูปภาพ");
      return;
    }
    if (file.size > 900 * 1024) {
      showToast("รูปภาพใหญ่เกินไป กรุณาเลือกไฟล์ไม่เกิน 900 KB");
      return;
    }
    photo = await readFileAsDataURL(file);
  }

  const report = {
    id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
    placeName,
    level,
    lat,
    lng,
    waterDepth: document.getElementById("waterDepth").value,
    details: document.getElementById("details").value.trim(),
    photo,
    createdAt: new Date().toLocaleString("th-TH")
  };

  reports.push(report);
  if (!saveReports()) {
    reports.pop();
    return;
  }

  if (selectedMarker) {
    map.removeLayer(selectedMarker);
    selectedMarker = null;
  }
  form.reset();
  render();
  highlightReport(report.id);
  showToast("บันทึกรายงานเรียบร้อยแล้ว");
});

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

document.getElementById("reportList").addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === "show") highlightReport(id);
  if (button.dataset.action === "delete") {
    if (!confirm("ต้องการลบรายงานจุดนี้ใช่หรือไม่?")) return;
    reports = reports.filter(report => report.id !== id);
    saveReports();
    render();
    showToast("ลบรายงานแล้ว");
  }
});

document.getElementById("clearBtn").addEventListener("click", () => {
  if (!reports.length) return showToast("ยังไม่มีข้อมูลให้ลบ");
  if (!confirm("ต้องการลบรายงานทั้งหมดในเบราว์เซอร์นี้ใช่หรือไม่?")) return;
  reports = [];
  saveReports();
  render();
  showToast("ลบข้อมูลทั้งหมดแล้ว");
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(reports, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sriyapai-flood-reports.json";
  link.click();
  URL.revokeObjectURL(url);
  showToast("ส่งออกข้อมูล JSON แล้ว");
});

document.getElementById("importFile").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported) || imported.some(item =>
      !item || typeof item.placeName !== "string" ||
      !Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lng)))) {
      throw new Error("รูปแบบข้อมูลไม่ถูกต้อง");
    }
    const normalized = imported.map(item => ({
      ...item,
      id: String(item.id || (crypto.randomUUID ? crypto.randomUUID() : Date.now() + Math.random())),
      lat: Number(item.lat),
      lng: Number(item.lng),
      level: LEVELS[item.level] ? item.level : "watch"
    }));
    reports = [...reports, ...normalized];
    if (!saveReports()) {
      reports = reports.slice(0, reports.length - normalized.length);
      return;
    }
    render();
    showToast(`นำเข้าข้อมูล ${normalized.length} รายการแล้ว`);
  } catch (error) {
    showToast("นำเข้าไม่สำเร็จ: ไฟล์ JSON ไม่ถูกต้อง");
  }
  event.target.value = "";
});

document.getElementById("locateBtn").addEventListener("click", () => {
  if (!navigator.geolocation) return showToast("เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง");
  showToast("กำลังค้นหาตำแหน่งของคุณ...");
  navigator.geolocation.getCurrentPosition(
    position => {
      const point = [position.coords.latitude, position.coords.longitude];
      map.setView(point, 17);
      latInput.value = point[0].toFixed(6);
      lngInput.value = point[1].toFixed(6);
      showToast("ระบุตำแหน่งแล้ว");
    },
    () => showToast("ระบุตำแหน่งไม่ได้ กรุณาอนุญาตการเข้าถึงตำแหน่งหรือคลิกแผนที่แทน"),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

render();
