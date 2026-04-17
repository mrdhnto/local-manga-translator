/**
 * Debug Utilities — Log and Save API Calls, Metadata, and Responses.
 */
(function() {
  "use strict";

  window.MangaTLDebug = {
    saveLog: function(result, img, settings) {
      if (!CONFIG.DEBUG_MODE) return;
      try {
        const logs = JSON.parse(sessionStorage.getItem("mangaTLDebugLogs") || "[]");
        logs.push({
          timestamp: new Date().toISOString(),
          success: result.success,
          payload: result.payload,
          response: result.responseData || result.error,
          meta: {
            pageUrl: window.location.href,
            imageUrl: img.src,
            imageWidth: img.naturalWidth,
            imageHeight: img.naturalHeight,
            apiSchema: settings.apiSchema,
            apiHost: settings.apiHost,
            apiEndpoint: settings.apiSchema === "lmstudio" ? settings.apiEndpointLmStudio : settings.apiEndpointOpenAI,
            model: settings.model,
            translateFrom: settings.translateFrom,
            translateTo: settings.translateTo
          }
        });
        sessionStorage.setItem("mangaTLDebugLogs", JSON.stringify(logs));
      } catch (e) {
        console.warn("[MangaTL] Failed to save debug log to sessionStorage:", e);
      }
    },

    openModal: function() {
      let existing = document.getElementById("manga-tl-debug-modal");
      if (existing) existing.remove();

      const modal = document.createElement("div");
      modal.id = "manga-tl-debug-modal";
      modal.style.cssText = "position: fixed; top: 5vh; left: 5vw; width: 90vw; height: 90vh; background: #1e1e1e; color: #fff; z-index: 9999999; box-shadow: 0 0 30px rgba(0,0,0,0.8); border-radius: 8px; display: flex; flex-direction: column; font-family: sans-serif;";

      const header = document.createElement("div");
      header.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; border-bottom: 1px solid #333; background: #252525; border-radius: 8px 8px 0 0;";
      
      const title = document.createElement("h2");
      title.textContent = "Manga Translator API Debug Logs";
      title.style.cssText = "margin: 0; font-size: 18px; color: #eee;";
      
      const actions = document.createElement("div");
      
      const btnExport = document.createElement("button");
      btnExport.textContent = "Export JSON";
      btnExport.title = "Save logs as a file";
      btnExport.style.cssText = "margin-right: 10px; padding: 6px 12px; cursor: pointer; background: #27ae60; color: white; border: none; border-radius: 4px; font-size: 14px;";
      btnExport.onclick = () => {
        try {
          const logsRaw = sessionStorage.getItem("mangaTLDebugLogs") || "[]";
          const logsObj = JSON.parse(logsRaw);
          if (logsObj.length === 0) return alert("No debug logs to export.");
          const blob = new Blob([JSON.stringify(logsObj, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          a.download = `manga-tl-debug-${timestamp}.json`;
          a.click();
          URL.revokeObjectURL(url);
        } catch (e) {
          console.error("Failed to export debug logs:", e);
        }
      };
      
      const btnClear = document.createElement("button");
      btnClear.textContent = "Clear Data";
      btnClear.style.cssText = "margin-right: 10px; padding: 6px 12px; cursor: pointer; background: #c0392b; color: white; border: none; border-radius: 4px; font-size: 14px;";
      btnClear.onclick = () => {
        sessionStorage.removeItem("mangaTLDebugLogs");
        renderLogs();
      };
      
      const btnClose = document.createElement("button");
      btnClose.textContent = "Close";
      btnClose.style.cssText = "padding: 6px 12px; cursor: pointer; background: #555; color: white; border: none; border-radius: 4px; font-size: 14px;";
      btnClose.onclick = () => modal.remove();

      actions.appendChild(btnExport);
      actions.appendChild(btnClear);
      actions.appendChild(btnClose);
      header.appendChild(title);
      header.appendChild(actions);
      modal.appendChild(header);

      const listContainer = document.createElement("div");
      listContainer.style.cssText = "flex: 1; overflow-y: auto; padding: 20px; background: #121212;";
      modal.appendChild(listContainer);

      function renderLogs() {
        listContainer.innerHTML = "";
        let logs = [];
        try {
          logs = JSON.parse(sessionStorage.getItem("mangaTLDebugLogs") || "[]");
        } catch (e) {}

        if (logs.length === 0) {
          listContainer.innerHTML = "<div style='color: #888; text-align: center; margin-top: 20px;'>No API calls recorded in this session.</div>";
          return;
        }

        logs.forEach((log, i) => {
          const item = document.createElement("div");
          item.style.cssText = "margin-bottom: 20px; border: 1px solid #333; border-radius: 6px; background: #1e1e1e; overflow: hidden;";
          
          const topRow = document.createElement("div");
          topRow.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; background: #252525; cursor: pointer; border-bottom: 1px solid transparent; transition: background 0.2s;";
          topRow.onmouseover = () => topRow.style.background = "#2a2a2a";
          topRow.onmouseout = () => topRow.style.background = "#252525";
          
          const info = document.createElement("div");
          const statusColor = log.success ? "#4CAF50" : "#F44336";
          const timeStr = new Date(log.timestamp).toLocaleTimeString();
          info.innerHTML = "<span class='collapse-icon' style='display:inline-block; margin-right:8px; transition: transform 0.2s; font-size:10px; color: #888;'>▶</span><strong style='color:#ccc;'>[" + (i+1) + "]</strong> " + timeStr + " — <span style='font-weight:bold; color: " + statusColor + "'>" + (log.success ? "SUCCESS" : "FAILED") + "</span>";
          
          const icon = info.querySelector('.collapse-icon');

          const btnCopy = document.createElement("button");
          btnCopy.textContent = "Copy Data";
          btnCopy.style.cssText = "padding: 4px 10px; cursor: pointer; background: #2980b9; color: white; border: none; border-radius: 4px; font-size: 12px;";
          btnCopy.onclick = (e) => {
            e.stopPropagation(); // Prevent modal collapse toggle
            navigator.clipboard.writeText(JSON.stringify({ meta: log.meta, payload: log.payload, response: log.response }, null, 2)).then(() => {
              btnCopy.textContent = "Copied!";
              setTimeout(() => btnCopy.textContent = "Copy Data", 2000);
            }).catch(() => {
              btnCopy.textContent = "Failed";
              setTimeout(() => btnCopy.textContent = "Copy Data", 2000);
            });
          };
          
          topRow.appendChild(info);
          topRow.appendChild(btnCopy);
          item.appendChild(topRow);
          
          const details = document.createElement("div");
          details.style.cssText = "display: none; flex-direction: column; gap: 1px; background: #333; border-top: 1px solid #333;";
          
          topRow.onclick = () => {
            const isCollapsed = details.style.display === "none";
            details.style.display = isCollapsed ? "flex" : "none";
            icon.style.transform = isCollapsed ? "rotate(90deg)" : "rotate(0deg)";
            topRow.style.borderBottomColor = isCollapsed ? "#333" : "transparent";
          };
          
          const metaSec = document.createElement("div");
          metaSec.style.cssText = "background: #1e1e1e; padding: 15px;";
          metaSec.innerHTML = "<strong style='color:#aaa; font-size:12px; display:block; margin-bottom:5px;'>METADATA:</strong>";
          const metaPre = document.createElement("pre");
          metaPre.style.cssText = "margin: 0; font-size: 12px; color: #dcdcaa; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; max-height: 250px; overflow-y: auto;";
          metaPre.textContent = log.meta ? JSON.stringify(log.meta, null, 2) : "No metadata";
          metaSec.appendChild(metaPre);

          const payloadSec = document.createElement("div");
          payloadSec.style.cssText = "background: #1e1e1e; padding: 15px;";
          payloadSec.innerHTML = "<strong style='color:#aaa; font-size:12px; display:block; margin-bottom:5px;'>REQUEST PAYLOAD:</strong>";
          const payloadPre = document.createElement("pre");
          payloadPre.style.cssText = "margin: 0; font-size: 12px; color: #9cdcfe; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; max-height: 250px; overflow-y: auto;";
          payloadPre.textContent = JSON.stringify(log.payload, null, 2);
          payloadSec.appendChild(payloadPre);
          
          const responseSec = document.createElement("div");
          responseSec.style.cssText = "background: #1e1e1e; padding: 15px;";
          responseSec.innerHTML = "<strong style='color:#aaa; font-size:12px; display:block; margin-bottom:5px;'>RETURN DATA:</strong>";
          const responsePre = document.createElement("pre");
          responsePre.style.cssText = "margin: 0; font-size: 12px; color: #ce9178; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; max-height: 250px; overflow-y: auto;";
          const respText = typeof log.response === "object" ? JSON.stringify(log.response, null, 2) : log.response;
          responsePre.textContent = respText;
          responseSec.appendChild(responsePre);
          
          details.appendChild(metaSec);
          details.appendChild(payloadSec);
          details.appendChild(responseSec);
          item.appendChild(details);
          listContainer.appendChild(item);
        });
      }

      renderLogs();
      document.body.appendChild(modal);
    }
  };
})();
