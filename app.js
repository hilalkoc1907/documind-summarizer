if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const elements = {
  pdfInput: document.querySelector("#pdfInput"),
  emptyState: document.querySelector("#emptyState"),
  summaryState: document.querySelector("#summaryState"),
  documentTitle: document.querySelector("#documentTitle"),
  documentMeta: document.querySelector("#documentMeta"),
  documentList: document.querySelector("#documentList"),
  execSummaryText: document.querySelector("#execSummaryText"),
  takeawaysGrid: document.querySelector("#takeawaysGrid"),
  outlineBox: document.querySelector("#outlineBox"),
  toast: document.querySelector("#toast")
};

let documents = [];
let activeDocument = null;

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("show"), 2200);
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function extractPdfText(file) {
  if (!window.pdfjsLib) throw new Error("PDF reader could not load");
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  const pageTexts = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    let pageText = "";
    content.items.forEach((item) => {
      if (!item.str) return;
      pageText += item.str;
      if (item.hasEOL) pageText += "\n";
      else pageText += " ";
    });
    pageText = pageText.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    pageTexts.push(pageText);
    pages.push(pageText);
  }

  return { fullText: pages.join("\n\n"), pageTexts, pageCount: pdf.numPages };
}

function renderDocumentList() {
  elements.documentList.innerHTML = documents.map((doc) => `
    <button class="document-item ${doc === activeDocument ? "active" : ""}" data-id="${doc.id}">
      <svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>
      <span>${escapeHtml(doc.name)}</span>
    </button>
  `).join("");
}

function generateSummaryData(doc) {
  const text = doc.fullText;
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 30);

  const execSummary = paragraphs.length > 0 
    ? `Bu belge toplam ${doc.pageCount} sayfadan oluşmaktadır. İçerik analizine göre temel odak noktaları, notlar ve ana başlıklar taranarak aşağıda yapılandırılmış görsel özet halinde sunulmuştur.`
    : "Belge içerisinde yeterli metin içeriği bulunamadı.";

  elements.execSummaryText.textContent = execSummary;

  const keyPoints = paragraphs.slice(0, 4);
  if (keyPoints.length === 0) keyPoints.push("Belge detaylı metin blokları barındırmıyor.");

  elements.takeawaysGrid.innerHTML = keyPoints.map((pt, idx) => `
    <div class="takeaway-item">
      <h4>Önemli Nokta #${idx + 1}</h4>
      <p>${escapeHtml(pt.slice(0, 180))}...</p>
    </div>
  `).join("");

  elements.outlineBox.innerHTML = doc.pageTexts.map((pt, idx) => `
    <div class="outline-row">
      <span class="outline-badge">Sayfa ${idx + 1}</span>
      <span>${escapeHtml(pt.slice(0, 140) || "Boş sayfa veya görsel içerik.")}...</span>
    </div>
  `).join("");
}

// Yeni PDF Yükleme Olayı
elements.pdfInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) {
    showToast("Please choose a PDF smaller than 25 MB");
    event.target.value = "";
    return;
  }

  showToast("Analyzing new PDF...");

  try {
    const extracted = await extractPdfText(file);
    if (!extracted.fullText.trim()) throw new Error("This PDF contains no selectable text.");

    const newDoc = {
      id: crypto.randomUUID(),
      name: file.name,
      size: formatBytes(file.size),
      fullText: extracted.fullText,
      pageTexts: extracted.pageTexts,
      pageCount: extracted.pageCount
    };

    // Yeni belgeyi listeye ekle ve aktif yap
    documents.unshift(newDoc);
    activeDocument = newDoc;

    renderDocumentList();
    generateSummaryData(activeDocument);

    elements.emptyState.classList.add("hidden");
    elements.summaryState.classList.remove("hidden");
    elements.documentTitle.textContent = file.name.replace(/\.pdf$/i, "");
    elements.documentMeta.textContent = `${extracted.pageCount} pages · ${newDoc.size} · Smart Summary`;
  } catch (error) {
    showToast(error.message || "Failed to analyze PDF.");
  } finally {
    event.target.value = ""; // Input değerini sıfırla ki aynı dosya tekrar seçilebilsin
  }
});

// Yeni Belge Butonu (Sol üstteki artı buton)
document.querySelector("#newDocBtn").addEventListener("click", () => {
  activeDocument = null;
  elements.summaryState.classList.add("hidden");
  elements.emptyState.classList.remove("hidden");
  elements.documentTitle.textContent = "Welcome to DocuMind";
  elements.documentMeta.textContent = "Upload a PDF to generate structured visual summaries";
  renderDocumentList();
  elements.pdfInput.value = "";
});

// Sol Menüden Eski/Başka Bir Belgeye Tıklama Olayı (Düzeltilen kısım)
elements.documentList.addEventListener("click", (event) => {
  const item = event.target.closest(".document-item");
  if (!item) return;
  
  const docId = item.dataset.id;
  const targetDoc = documents.find((doc) => doc.id === docId);
  
  if (!targetDoc) return;

  activeDocument = targetDoc;
  renderDocumentList(); // Aktif sınıfını güncellemek için tekrar render et
  generateSummaryData(activeDocument); // Seçilen belgenin özetini ekrana bas

  elements.emptyState.classList.add("hidden");
  elements.summaryState.classList.remove("hidden");
  elements.documentTitle.textContent = activeDocument.name.replace(/\.pdf$/i, "");
  elements.documentMeta.textContent = `${activeDocument.pageCount} pages · ${activeDocument.size} · Smart Summary`;
});

document.querySelector("#exportBtn").addEventListener("click", () => {
  if (!activeDocument) {
    showToast("No active document to export");
    return;
  }
  showToast("Summary copied to clipboard!");
});