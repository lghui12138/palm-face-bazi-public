(function (root) {
  "use strict";

  const catalog = Object.freeze([
    { key: "life_line", label: "生命线", sourceRefs: ["local.reid#major-line-map", "local.nuoyu#life-line", "local.chentai#life-line"], allowedTypes: ["palm_front", "palm_main_detail"] },
    { key: "head_line", label: "智慧线", sourceRefs: ["local.reid#major-line-map", "local.nuoyu#head-line", "local.chentai#head-line"], allowedTypes: ["palm_front", "palm_main_detail"] },
    { key: "heart_line", label: "感情线", sourceRefs: ["local.reid#major-line-map", "local.nuoyu#heart-line", "local.chentai#heart-line"], allowedTypes: ["palm_front", "palm_main_detail"] },
    { key: "fate_line", label: "命运线", sourceRefs: ["local.reid#fate-line", "local.chentai#success-line"], allowedTypes: ["palm_front", "palm_main_detail"] },
    { key: "sun_line", label: "太阳线", sourceRefs: ["local.reid#sun-line", "local.nuoyu#success-line", "local.chentai#success-line"], allowedTypes: ["palm_front", "palm_sun_wealth_detail"] },
    { key: "wealth_lines", label: "财运纹", sourceRefs: ["local.reid#auxiliary-lines", "local.chentai#wealth-chapter"], allowedTypes: ["palm_front", "palm_sun_wealth_detail"] },
    { key: "helper_lines", label: "贵人线", sourceRefs: ["local.reid#auxiliary-lines", "local.nuoyu#flow-chart"], allowedTypes: ["palm_front", "palm_helper_detail"] },
    { key: "marriage_lines", label: "婚姻线", sourceRefs: ["local.nuoyu#marriage-line"], allowedTypes: ["palm_side"] }
  ]);

  function view(value, allowedCatalog) {
    if (!value || typeof value !== "object" || value.namingAllowed !== false || value.reviewRequired !== true) return null;
    const allowed = new Map((Array.isArray(allowedCatalog) ? allowedCatalog : catalog).map((item) => [item.key, item]));
    const candidates = (Array.isArray(value.candidates) ? value.candidates : []).map((item) => {
      const spec = item && allowed.get(String(item.key || ""));
      const score = Number(item && item.score);
      if (!spec || !Number.isFinite(score) || score < 0 || score > 0.84) return null;
      return { key: spec.key, label: spec.label, score, reasons: Array.isArray(item.reasons) ? item.reasons.slice(0, 3).map(String) : [] };
    }).filter(Boolean).slice(0, 3);
    if (!candidates.length) return null;
    const recommendedKey = candidates.some((item) => item.key === value.recommendedKey) ? value.recommendedKey : candidates[0].key;
    return {
      candidates,
      recommendedKey,
      ambiguous: Boolean(value.ambiguous),
      status: String(value.status || "weak_geometry_match"),
      namingAllowed: false
    };
  }

  function snapshot(value, confirmedKey) {
    const result = view(value, catalog);
    if (!result || !catalog.some((item) => item.key === confirmedKey)) return null;
    return {
      version: 1,
      recommendedKey: result.recommendedKey,
      confirmedKey,
      matched: result.recommendedKey === confirmedKey,
      ambiguous: result.ambiguous,
      candidates: result.candidates.map((item) => ({ key: item.key, score: item.score })),
      source: "local_anatomical_geometry_ranker_v1",
      namingAllowed: false
    };
  }

  function controls(sample, polyline, review, allowedCatalog) {
    if (!sample || !polyline || polyline.reviewStatus !== "accepted") return "";
    const choices = Array.isArray(allowedCatalog) ? allowedCatalog : [];
    if (!choices.length) return `<div class="case-meta">当前角度不允许建立掌纹名称真值；先把样本角度修正为掌心、主线近照或小指侧边。</div>`;
    const suggestion = view(polyline.semanticSuggestion, choices);
    const suggestedKey = suggestion && !suggestion.ambiguous ? suggestion.recommendedKey : "";
    const selectedKey = choices.some((item) => item.key === review.candidateKey)
      ? review.candidateKey
      : choices.some((item) => item.key === suggestedKey) ? suggestedKey : "";
    const selected = choices.find((item) => item.key === selectedKey);
    const statusText = review.status === "confirmed"
      ? `已二阶段确认：${selected ? selected.label : selectedKey}`
      : review.status === "proposed"
        ? `已初标：${selected ? selected.label : selectedKey}，等待复核确认`
        : review.status === "invalidated"
          ? "几何已变化，旧标签作废，需重新初标"
          : "尚未建立掌纹名称真值";
    const primaryAction = review.status === "proposed" ? "confirm" : "propose";
    const primaryLabel = review.status === "proposed" ? "复核确认" : review.status === "confirmed" ? "重新初标" : "初标";
    const pct = (value) => `${Math.round(Number(value || 0) * 100)}%`;
    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
    const suggestionText = suggestion
      ? `几何候选：${suggestion.candidates.map((item) => `${item.label} ${pct(item.score)}${item.reasons.length ? `（${item.reasons.join("、")}）` : ""}`).join("；")}。${suggestion.ambiguous ? "候选接近，逐条对照原图。" : "已预选最高候选，未命名。"}`
      : "几何不足，请对照原图和书中位置图。";
    return `<div class="crease-semantic-controls">
      <label><span>传统掌纹名称</span><select data-crease-semantic-key><option value=""${selectedKey ? "" : " selected"}>先对照原图再选</option>${choices.map((item) => `<option value="${item.key}"${item.key === selectedKey ? " selected" : ""}>${item.label}</option>`).join("")}</select></label>
      <button type="button" class="secondary-action compact-action" data-crease-semantic-action="${primaryAction}" data-crease-sample-id="${esc(sample.id || "")}" data-crease-polyline-key="${esc(polyline.key || "")}">${primaryLabel}</button>
      ${review.status !== "unclassified" ? `<button type="button" class="secondary-action compact-action" data-crease-semantic-action="clear" data-crease-sample-id="${esc(sample.id || "")}" data-crease-polyline-key="${esc(polyline.key || "")}">清除标签</button>` : ""}
      <span class="case-meta">${esc(suggestionText)}</span>
      <span class="case-meta">${esc(statusText)}；只作为传统分类真值，不证明预测有效。</span>
    </div>`;
  }

  root.PalmSemanticRuntime = Object.freeze({ catalog, view, snapshot, controls });
})(globalThis);
