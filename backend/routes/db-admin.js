const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { BLUSANTA_CONFIG } = require("../utils/constants");

/**
 * BluSanta Database Admin Interface
 * Provides a comprehensive HTML interface for viewing and managing assessments
 */

// Database admin web interface
router.get("/db_admin/assessments", (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BluSanta Database Admin</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 1600px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      font-size: 32px;
      margin-bottom: 10px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 20px;
      padding: 30px;
      background: #f8f9fa;
    }
    .stat-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      text-align: center;
    }
    .stat-card .number {
      font-size: 36px;
      font-weight: bold;
      color: #1e3c72;
      margin-bottom: 5px;
    }
    .stat-card .label {
      color: #666;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .controls {
      padding: 20px 30px;
      background: white;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      gap: 15px;
      flex-wrap: wrap;
      align-items: center;
    }
    .controls button, .controls select, .controls input {
      padding: 10px 20px;
      border-radius: 6px;
      border: 1px solid #ddd;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.3s;
    }
    .controls button {
      background: #1e3c72;
      color: white;
      border: none;
    }
    .controls button:hover {
      background: #2a5298;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(30, 60, 114, 0.4);
    }
    .controls button:disabled {
      background: #ccc;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }
    .controls input {
      flex: 1;
      min-width: 200px;
    }
    .table-container {
      overflow-x: auto;
      padding: 30px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      border-radius: 8px;
      overflow: hidden;
    }
    th {
      background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
      color: white;
      padding: 15px;
      text-align: left;
      font-weight: 600;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    td {
      padding: 12px 15px;
      border-bottom: 1px solid #e0e0e0;
    }
    tr:hover {
      background: #f8f9fa;
    }
    .status-badge {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      display: inline-block;
    }
    .status-pending {
      background: #fff3cd;
      color: #856404;
    }
    .status-processing {
      background: #cfe2ff;
      color: #084298;
    }
    .status-completed {
      background: #d1e7dd;
      color: #0f5132;
    }
    .status-failed {
      background: #f8d7da;
      color: #842029;
    }
    .status-skipped {
      background: #e2e3e5;
      color: #41464b;
    }
    .video-link {
      color: #1e3c72;
      text-decoration: none;
      font-weight: 500;
    }
    .video-link:hover {
      text-decoration: underline;
    }
    /* Modal Styles */
    .modal-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.6);
      z-index: 1000;
      justify-content: center;
      align-items: center;
    }
    .modal-overlay.active {
      display: flex;
    }
    .modal {
      background: white;
      border-radius: 12px;
      padding: 30px;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .modal h2 {
      margin-bottom: 20px;
      color: #333;
    }
    .modal .form-group {
      margin-bottom: 20px;
    }
    .modal label {
      display: block;
      margin-bottom: 8px;
      font-weight: 600;
      color: #555;
    }
    .modal input[type="text"] {
      width: 100%;
      padding: 12px;
      border: 2px solid #ddd;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.3s;
    }
    .modal input[type="text"]:focus {
      border-color: #1e3c72;
      outline: none;
    }
    .modal .info-text {
      font-size: 13px;
      color: #666;
      margin-top: 8px;
    }
    .modal .current-value {
      background: #f8f9fa;
      padding: 10px;
      border-radius: 6px;
      margin-bottom: 15px;
      font-size: 14px;
    }
    .modal .button-group {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-top: 25px;
    }
    .modal button {
      padding: 12px 24px;
      border-radius: 8px;
      border: none;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
    }
    .modal .btn-cancel {
      background: #e0e0e0;
      color: #333;
    }
    .modal .btn-cancel:hover {
      background: #d0d0d0;
    }
    .modal .btn-regenerate {
      background: #ff9800;
      color: white;
    }
    .modal .btn-regenerate:hover {
      background: #f57c00;
    }
    .modal .btn-regenerate:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    .btn-regen {
      background: #ff9800 !important;
      padding: 5px 10px;
      font-size: 12px;
      margin-right: 5px;
    }
    .btn-regen:hover {
      background: #f57c00 !important;
    }
    .btn-skip {
      background: #dc3545 !important;
      padding: 5px 10px;
      font-size: 12px;
    }
    .btn-skip:hover {
      background: #c82333 !important;
    }
    .btn-reset {
      background: #17a2b8 !important;
      padding: 5px 10px;
      font-size: 12px;
    }
    .btn-reset:hover {
      background: #138496 !important;
    }
    .loading {
      text-align: center;
      padding: 60px;
      color: #666;
      font-size: 18px;
    }
    .loading::after {
      content: '';
      animation: dots 1.5s infinite;
    }
    @keyframes dots {
      0%, 20% { content: '.'; }
      40% { content: '..'; }
      60%, 100% { content: '...'; }
    }
    .info-bar {
      background: #e3f2fd;
      padding: 15px 30px;
      border-bottom: 1px solid #bbdefb;
      font-size: 14px;
      color: #1565c0;
    }
    .info-bar strong {
      color: #0d47a1;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎅 BluSanta Database Admin</h1>
      <p>Real-time Assessment Tracking & Monitoring</p>
    </div>

    <div class="info-bar">
      <strong>ℹ️ System Info:</strong> 
      Audio generation via ElevenLabs API | 
      Video stitching via FFmpeg | 
      Last updated: <span id="last-update">-</span>
    </div>
    
    <div class="stats" id="stats">
      <div class="stat-card">
        <div class="number" id="total">-</div>
        <div class="label">Total</div>
      </div>
      <div class="stat-card">
        <div class="number" id="pending-audio">-</div>
        <div class="label">Pending Audio</div>
      </div>
      <div class="stat-card">
        <div class="number" id="pending-stitch">-</div>
        <div class="label">Pending Stitch</div>
      </div>
      <div class="stat-card">
        <div class="number" id="completed">-</div>
        <div class="label">Completed</div>
      </div>
      <div class="stat-card">
        <div class="number" id="failed">-</div>
        <div class="label">Failed/Skipped</div>
      </div>
    </div>

    <div class="controls">
      <button onclick="loadData();">🔄 Refresh</button>
      <button onclick="triggerAudioGeneration()" style="background: #28a745;">🎤 Trigger Audio Gen</button>
      <button onclick="triggerVideoStitching()" style="background: #17a2b8;">🎬 Trigger Stitching</button>
      <select id="filterStatus" onchange="loadData()">
        <option value="">All Status</option>
        <option value="pending-audio">Pending Audio</option>
        <option value="pending-stitch">Pending Stitch</option>
        <option value="completed">Completed</option>
        <option value="failed">Failed/Skipped</option>
      </select>
      <input type="text" id="searchBox" placeholder="🔍 Search by Employee Code, Doctor Name, or Mobile..." onkeyup="filterTable()">
    </div>

    <!-- Regeneration Modal -->
    <div class="modal-overlay" id="regenModal">
      <div class="modal">
        <h2>🔄 Regenerate Video</h2>
        <div id="regenInfo"></div>
        <div class="form-group">
          <label for="namePronunciation">Name Pronunciation</label>
          <input type="text" id="namePronunciation" placeholder="e.g., Priya Sharma">
          <p class="info-text">Enter the correct pronunciation for the doctor's name. This will be used in the audio: "Doctor [pronunciation]"</p>
        </div>
        <div class="button-group">
          <button class="btn-cancel" onclick="closeRegenModal()">Cancel</button>
          <button class="btn-regenerate" id="btnConfirmRegen" onclick="confirmRegenerate()">🔄 Regenerate</button>
        </div>
      </div>
    </div>

    <div class="table-container">
      <div id="loading" class="loading">Loading assessments</div>
      <table id="assessmentsTable" style="display: none;">
        <thead>
          <tr>
            <th>ID</th>
            <th>Status</th>
            <th>Employee</th>
            <th>Doctor</th>
            <th>Dr. Code</th>
            <th>Dr. Mobile</th>
            <th>Name Pronunciation</th>
            <th>Audio</th>
            <th>Stitch</th>
            <th>Final Video</th>
            <th>Error</th>
            <th>Created At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="tableBody"></tbody>
      </table>
    </div>
  </div>

  <script>
    let allData = [];

    async function loadData() {
      document.getElementById('loading').style.display = 'block';
      document.getElementById('assessmentsTable').style.display = 'none';

      try {
        const response = await fetch('/db_admin/api/all_assessments');
        const result = await response.json();
        allData = result.assessments || [];
        
        // Calculate stats
        const stats = {
          total: allData.length,
          pendingAudio: allData.filter(a => a.audio_generation === 0 && a.video_stitch !== -1).length,
          pendingStitch: allData.filter(a => a.audio_generation === 1 && a.video_stitch === 0).length,
          completed: allData.filter(a => a.video_stitch === 1 && a.final_video_url).length,
          failed: allData.filter(a => a.video_stitch === -1 || a.audio_generation === -1).length
        };

        document.getElementById('total').textContent = stats.total;
        document.getElementById('pending-audio').textContent = stats.pendingAudio;
        document.getElementById('pending-stitch').textContent = stats.pendingStitch;
        document.getElementById('completed').textContent = stats.completed;
        document.getElementById('failed').textContent = stats.failed;
        document.getElementById('last-update').textContent = new Date().toLocaleTimeString();

        renderTable();
      } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('loading').textContent = 'Error loading data. Please try again.';
      }
    }

    function getStatus(assessment) {
      if (assessment.video_stitch === -1 || assessment.audio_generation === -1) {
        return { label: '❌ Skipped', class: 'status-skipped' };
      } else if (assessment.video_stitch === 1 && assessment.final_video_url) {
        return { label: '✅ Completed', class: 'status-completed' };
      } else if (assessment.audio_generation === 1 && assessment.video_stitch === 0) {
        return { label: '🟠 Stitching', class: 'status-processing' };
      } else if (assessment.audio_generation === 0) {
        return { label: '⏳ Pending Audio', class: 'status-pending' };
      } else {
        return { label: '⏳ Pending', class: 'status-pending' };
      }
    }

    function renderTable() {
      const tbody = document.getElementById('tableBody');
      const filterStatus = document.getElementById('filterStatus').value;

      let filteredData = allData;

      // Apply status filter
      if (filterStatus) {
        filteredData = filteredData.filter(a => {
          if (filterStatus === 'pending-audio') return a.audio_generation === 0 && a.video_stitch !== -1;
          if (filterStatus === 'pending-stitch') return a.audio_generation === 1 && a.video_stitch === 0;
          if (filterStatus === 'completed') return a.video_stitch === 1 && a.final_video_url;
          if (filterStatus === 'failed') return a.video_stitch === -1 || a.audio_generation === -1;
          return true;
        });
      }

      tbody.innerHTML = filteredData.map(assessment => {
        const status = getStatus(assessment);
        const createdAt = new Date(assessment.created_at).toLocaleString();
        
        return \`
          <tr>
            <td><strong>#\${assessment.id}</strong></td>
            <td><span class="status-badge \${status.class}">\${status.label}</span></td>
            <td><strong>\${assessment.employee_code}</strong><br><small>\${assessment.employee_name || ''}</small></td>
            <td>Dr. \${assessment.dr_first_name} \${assessment.dr_last_name}</td>
            <td>\${assessment.dr_code}</td>
            <td>\${assessment.dr_mobile}</td>
            <td>\${assessment.name_pronunciation || '-'}</td>
            <td>\${assessment.audio_generation === 1 ? '✅' : (assessment.audio_generation === -1 ? '❌' : '⏳')}</td>
            <td>\${assessment.video_stitch === 1 ? '✅' : (assessment.video_stitch === -1 ? '❌' : (assessment.audio_generation === 1 ? '🟠' : '⏳'))}</td>
            <td>\${assessment.final_video_url ? 
              \`<a href="\${assessment.final_video_url}" target="_blank" class="video-link">View Video</a>\` : 
              '-'
            }</td>
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="\${assessment.error_message || ''}">\${assessment.error_message || '-'}</td>
            <td>\${createdAt}</td>
            <td style="white-space: nowrap;">
              \${assessment.video_stitch === 1 ? 
                \`<button class="btn-regen" onclick="openRegenModal(\${assessment.id}, '\${assessment.dr_first_name} \${assessment.dr_last_name}', '\${(assessment.name_pronunciation || '').replace(/'/g, "\\\\'")}')">🔄 Regen</button>\` : 
                ''
              }
              \${(assessment.video_stitch !== -1 && assessment.video_stitch !== 1) ? 
                \`<button class="btn-skip" onclick="skipAssessment(\${assessment.id})">Skip</button>\` : 
                ''
              }
              \${(assessment.video_stitch === -1 || assessment.audio_generation === -1) ? 
                \`<button class="btn-reset" onclick="resetAssessment(\${assessment.id})">Reset</button>\` : 
                ''
              }
            </td>
          </tr>
        \`;
      }).join('');

      document.getElementById('loading').style.display = 'none';
      document.getElementById('assessmentsTable').style.display = 'table';
    }

    function filterTable() {
      const searchTerm = document.getElementById('searchBox').value.toLowerCase();
      const rows = document.querySelectorAll('#tableBody tr');

      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
      });
    }

    async function triggerAudioGeneration() {
      const button = event.target;
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = '⏳ Processing...';

      try {
        const response = await fetch('/api/blusanta/initiate-audio-generation', { method: 'POST' });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || 'Failed to trigger audio generation');
        }

        alert(\`✅ Audio Generation Triggered!\n\n\${result.message}\`);
        loadData();
      } catch (error) {
        console.error('Error triggering audio generation:', error);
        alert(\`❌ Error: \${error.message}\`);
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    }

    async function triggerVideoStitching() {
      const button = event.target;
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = '⏳ Processing...';

      try {
        const response = await fetch('/api/blusanta/initiate-video-stitching', { method: 'POST' });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || 'Failed to trigger video stitching');
        }

        alert(\`✅ Video Stitching Triggered!\n\n\${result.message}\`);
        loadData();
      } catch (error) {
        console.error('Error triggering video stitching:', error);
        alert(\`❌ Error: \${error.message}\`);
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    }

    async function skipAssessment(id) {
      if (!confirm(\`Are you sure you want to skip assessment #\${id}? This will stop further processing.\`)) {
        return;
      }

      try {
        const response = await fetch('/db_admin/skip_assessment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to skip assessment');
        }

        alert(\`✅ Assessment #\${id} skipped successfully!\`);
        loadData();
      } catch (error) {
        console.error('Error skipping assessment:', error);
        alert(\`❌ Error: \${error.message}\`);
      }
    }

    async function resetAssessment(id) {
      if (!confirm(\`Are you sure you want to reset assessment #\${id}? This will restart processing from the beginning.\`)) {
        return;
      }

      try {
        const response = await fetch('/db_admin/reset_assessment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to reset assessment');
        }

        alert(\`✅ Assessment #\${id} reset successfully!\`);
        loadData();
      } catch (error) {
        console.error('Error resetting assessment:', error);
        alert(\`❌ Error: \${error.message}\`);
      }
    }

    // Regeneration Modal Functions
    let currentRegenId = null;

    function openRegenModal(id, doctorName, currentPronunciation) {
      currentRegenId = id;
      document.getElementById('regenInfo').innerHTML = \`
        <div class="current-value">
          <strong>Assessment ID:</strong> #\${id}<br>
          <strong>Doctor Name:</strong> Dr. \${doctorName}<br>
          <strong>Current Pronunciation:</strong> \${currentPronunciation || '(not set)'}
        </div>
      \`;
      document.getElementById('namePronunciation').value = currentPronunciation || '';
      document.getElementById('regenModal').classList.add('active');
    }

    function closeRegenModal() {
      currentRegenId = null;
      document.getElementById('regenModal').classList.remove('active');
      document.getElementById('namePronunciation').value = '';
    }

    async function confirmRegenerate() {
      if (!currentRegenId) return;

      const namePronunciation = document.getElementById('namePronunciation').value.trim();
      const btn = document.getElementById('btnConfirmRegen');
      const originalText = btn.textContent;

      btn.disabled = true;
      btn.textContent = '⏳ Processing...';

      try {
        const response = await fetch('/db_admin/regenerate_assessment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: currentRegenId,
            name_pronunciation: namePronunciation || null
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to regenerate assessment');
        }

        alert(\`✅ Assessment #\${currentRegenId} marked for regeneration!\n\nName Pronunciation: \${namePronunciation || '(not set)'}\n\nThe video will be regenerated automatically.\`);
        closeRegenModal();
        loadData();
      } catch (error) {
        console.error('Error regenerating assessment:', error);
        alert(\`❌ Error: \${error.message}\`);
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }

    // Close modal on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeRegenModal();
    });

    // Close modal on overlay click
    document.getElementById('regenModal').addEventListener('click', (e) => {
      if (e.target.id === 'regenModal') closeRegenModal();
    });

    // Auto-refresh every 30 seconds
    setInterval(() => {
      loadData();
    }, 30000);

    // Load data on page load
    loadData();
  </script>
</body>
</html>
  `;

  res.send(html);
});

/**
 * Skip an assessment
 */
router.post("/db_admin/skip_assessment", async (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: "Assessment ID is required" });
  }

  try {
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE assessments SET 
          audio_generation = -1, 
          video_stitch = -1, 
          error_message = 'Skipped by admin'
        WHERE id = ?`,
        [id],
        function (err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    console.log(`[ADMIN] ⏭️ Assessment ${id} skipped`);
    res.json({ success: true, message: `Assessment ${id} skipped` });
  } catch (error) {
    console.error("[ADMIN] Error skipping assessment:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Reset an assessment
 */
router.post("/db_admin/reset_assessment", async (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: "Assessment ID is required" });
  }

  try {
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE assessments SET 
          audio_generation = 0, 
          video_stitch = 0,
          final_video_url = NULL,
          error_message = NULL,
          is_regenerated = 0
        WHERE id = ?`,
        [id],
        function (err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    console.log(`[ADMIN] 🔄 Assessment ${id} reset`);
    res.json({ success: true, message: `Assessment ${id} reset` });
  } catch (error) {
    console.error("[ADMIN] Error resetting assessment:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Regenerate an assessment (mark for re-processing)
 */
router.post("/db_admin/regenerate_assessment", async (req, res) => {
  const { id, name_pronunciation } = req.body;

  if (!id) {
    return res.status(400).json({ error: "Assessment ID is required" });
  }

  try {
    // Build update query
    let updateQuery = `UPDATE assessments SET 
      audio_generation = 0, 
      video_stitch = 0,
      final_video_url = NULL,
      error_message = NULL,
      is_regenerated = 1`;

    const params = [];

    if (name_pronunciation) {
      updateQuery += `, name_pronunciation = ?`;
      params.push(name_pronunciation);
    }

    updateQuery += ` WHERE id = ?`;
    params.push(id);

    await new Promise((resolve, reject) => {
      db.run(updateQuery, params, function (err) {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log(`[ADMIN] 🔄 Assessment ${id} marked for regeneration`);
    res.json({
      success: true,
      message: `Assessment ${id} marked for regeneration`,
    });
  } catch (error) {
    console.error("[ADMIN] Error regenerating assessment:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all assessments as JSON (for the admin dashboard)
 */
router.get("/db_admin/api/all_assessments", async (req, res) => {
  try {
    const assessments = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM assessments ORDER BY created_at DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    res.json({ success: true, assessments });
  } catch (error) {
    console.error("[ADMIN] Error fetching assessments:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get assessment statistics as JSON
 */
router.get("/db_admin/stats", async (req, res) => {
  try {
    const stats = await new Promise((resolve, reject) => {
      db.get(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN audio_generation = 0 AND video_stitch != -1 THEN 1 ELSE 0 END) as pendingAudio,
          SUM(CASE WHEN audio_generation = 1 AND video_stitch = 0 THEN 1 ELSE 0 END) as pendingStitch,
          SUM(CASE WHEN video_stitch = 1 AND final_video_url IS NOT NULL THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN video_stitch = -1 OR audio_generation = -1 THEN 1 ELSE 0 END) as failed
        FROM assessments`,
        [],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    res.json({ success: true, stats });
  } catch (error) {
    console.error("[ADMIN] Error fetching stats:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
