let selectedRow = null;
let currentCourseId = null;

const table = document.getElementById("table");

init();
initDrag();

async function init() {
  await loadProvinces();
  for (let i = 0; i < 6; i++) addRow();
}

/* =========================
   Province
========================= */
async function loadProvinces() {
  try {
    const res = await fetch("/provinces");
    const data = await res.json();

    const el = document.getElementById("province");
    el.innerHTML = `<option value="">Select Province</option>`;

    data.forEach(p => {
      el.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    });

    el.onchange = () => {
      loadGrades();
      resetCourseInputs();
    };

  } catch (e) {
    alert("Failed to load provinces");
  }
}

/* =========================
   Grade
========================= */
async function loadGrades() {
  const provinceId = document.getElementById("province").value;
  const el = document.getElementById("grade");

  el.innerHTML = `<option value="">Select Grade</option>`;
  if (!provinceId) return;

  try {
    const res = await fetch(`/grades/${provinceId}`);
    const data = await res.json();

    data.forEach(g => {
      el.innerHTML += `<option value="${g.id}">${g.level}</option>`;
    });

    el.onchange = loadCourses;

  } catch {
    alert("Failed to load grades");
  }
}

/* =========================
   Course
========================= */
async function loadCourses() {
  const gradeId = document.getElementById("grade").value;
  const el = document.getElementById("course");

  resetCourseInputs();

  if (!gradeId) return;

  try {
    const res = await fetch(`/courses/${gradeId}`);
    const data = await res.json();

    el.innerHTML = `<option value="">Select Course</option>`;

    data.forEach(c => {
      el.innerHTML += `
        <option value="${c.id}" data-code="${c.code}" data-title="${c.title || ""}">
          ${c.code} ${c.title ? "- " + c.title : ""}
        </option>
      `;
    });

    // ✅ 添加 other
    el.innerHTML += `<option value="other">Other</option>`;

    el.onchange = handleCourseChange;

  } catch {
    alert("Failed to load courses");
  }
}

function handleCourseChange() {
  const el = document.getElementById("course");
  const selected = el.options[el.selectedIndex];

  const code = document.getElementById("courseCodeInput");
  const title = document.getElementById("courseTitleInput");

  if (el.value === "other") {
    currentCourseId = null;
    code.value = "";
    title.value = "";
    code.disabled = false;
    title.disabled = false;

  } else if (el.value) {
    currentCourseId = el.value;
    code.value = selected.dataset.code;
    title.value = selected.dataset.title;
    code.disabled = true;
    title.disabled = true;
  }
}

function resetCourseInputs() {
  const code = document.getElementById("courseCodeInput");
  const title = document.getElementById("courseTitleInput");

  code.value = "";
  title.value = "";
  code.disabled = true;
  title.disabled = true;
}

/* =========================
   Table
========================= */
function addRow() {
  const tr = document.createElement("tr");

  tr.innerHTML = `
    <td><input type="radio" name="row"></td>
    <td><input class="front"></td>
    <td><input class="back"></td>
  `;

  const radio = tr.querySelector("input[type=radio]");
  radio.onclick = () => {
    selectedRow = tr;
    document.getElementById("del").disabled = false;
  };

  table.appendChild(tr);
}

function deleteRow() {
  if (!selectedRow) return;
  selectedRow.remove();
  selectedRow = null;
  document.getElementById("del").disabled = true;
}

/* =========================
   Drag
========================= */
function initDrag() {
  new Sortable(table, { animation: 150 });
}

/* =========================
   Validate
========================= */
function validate() {
  const province = document.getElementById("province");
  const grade = document.getElementById("grade");
  const course = document.getElementById("course");

  let valid = true;

  [province, grade, course].forEach(el => {
    if (!el.value) {
      el.classList.add("error");
      valid = false;
    } else {
      el.classList.remove("error");
    }
  });

  return valid;
}

/* =========================
   Generate
========================= */
async function generate() {

  if (!validate()) {
    alert("Please complete required fields");
    return;
  }

  const gradeId = document.getElementById("grade").value;
  const courseEl = document.getElementById("course");

  let courseId = currentCourseId;

  // 处理 other
  if (courseEl.value === "other") {
    const code = document.getElementById("courseCodeInput").value;
    const title = document.getElementById("courseTitleInput").value;

    if (!code) {
      alert("Enter course code");
      return;
    }

    try {
      const res = await fetch("/add-course", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ gradeId, code, title })
      });

      const data = await res.json();
      courseId = data.id;

    } catch {
      alert("Failed to add course");
      return;
    }
  }

  const rows = document.querySelectorAll("#table tr");
  const cards = [];

  rows.forEach(r => {
    const front = r.querySelector(".front").value;
    const back = r.querySelector(".back").value;

    if (front && back) {
      cards.push({ front, back });

      // ✅ 保存统计
      fetch("/save-front", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ courseId, front })
      });
    }
  });

  if (!cards.length) {
    alert("No flashcards");
    return;
  }

  try {
    const res = await fetch("/generate-pdf", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ cards })
    });

    const blob = await res.blob();
    window.open(URL.createObjectURL(blob));

  } catch {
    alert("PDF failed");
  }
}

/* =========================
   CSV Upload（最终版）
========================= */
const uploadArea = document.getElementById("uploadArea");
const fileInput = document.getElementById("csvFile");
const uploadInfo = document.getElementById("uploadInfo");

/* 点击触发 */
uploadArea.addEventListener("click", () => fileInput.click());

/* 拖拽上传 */
uploadArea.addEventListener("dragover", e => {
  e.preventDefault();
  uploadArea.classList.add("dragover");
});

uploadArea.addEventListener("dragleave", () => {
  uploadArea.classList.remove("dragover");
});

uploadArea.addEventListener("drop", e => {
  e.preventDefault();
  uploadArea.classList.remove("dragover");

  const file = e.dataTransfer.files[0];
  if (file) {
    fileInput.files = e.dataTransfer.files;
    handleCSV({ target: { files: [file] } });
    showFileInfo(file);
  }
});

/* 选择文件 */
fileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (file) {
    showFileInfo(file);
    handleCSV(e);
  }
});

/* 显示文件信息 */
function showFileInfo(file) {
  uploadInfo.textContent = `Uploaded: ${file.name}`;
  uploadInfo.textContent = `Imported ${dataRows.length} cards`;
}

document.getElementById("csvFile").addEventListener("change", handleCSV);

function handleCSV(event) {
  const file = event.target.files[0];
  if (!file) return;

  // 文件类型检查
  if (!file.name.toLowerCase().endsWith(".csv")) {
    alert("Please upload a CSV file");
    return;
  }

  Papa.parse(file, {
    skipEmptyLines: true, // 自动忽略空行
    complete: function(results) {

      const rows = results.data;

      // 自动判断是否有 header（如果第一行包含字母）
      const hasHeader = rows.length && (
        String(rows[0][0]).toLowerCase().includes("front") ||
        String(rows[0][1]).toLowerCase().includes("back")
      );

      const dataRows = hasHeader ? rows.slice(1) : rows;

      // 清空表格
      table.innerHTML = "";

      dataRows.forEach(row => {
        const front = row[0]?.trim() || "";
        const back = row[1]?.trim() || "";

        if (!front && !back) return;

        addRow();

        const lastRow = table.lastChild;
        lastRow.querySelector(".front").value = front;
        lastRow.querySelector(".back").value = back;
      });

      // 自动滚动到顶部
      document.querySelector(".main").scrollTop = 0;
    }
  });
}