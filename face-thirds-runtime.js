(function (global) {
  "use strict";

  const refs = ["web.face-anthropometry#thirds", "web.apple-face#output"];
  const suspiciousManualSource = /^manual(?:_|$)/;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function percent(value) {
    return `${Math.round(Number(value || 0) * 100)}%`;
  }

  function sanitizeKeypoints(items) {
    return (Array.isArray(items) ? items : []).filter(Boolean).map((point) => {
      const source = String(point.source || "");
      if (!suspiciousManualSource.test(source)) return point;
      return {
        ...point,
        source: "external_unverified_manual_estimate",
        externalClaimedSource: source
      };
    });
  }

  function hairlineCorrections(sample) {
    return (sample && Array.isArray(sample.geometryCorrections) ? sample.geometryCorrections : [])
      .filter((item) => item && item.targetKind === "keypoint" && item.targetKey === "hairline_center");
  }

  function review(sample) {
    const items = hairlineCorrections(sample);
    const current = [...items].reverse().find((item) => item.reviewStatus !== "disabled") || null;
    return {
      current,
      status: current ? current.reviewStatus || "pending" : "empty",
      accepted: Boolean(current && current.reviewStatus === "accepted" && Number(current.reviewRounds || 0) >= 2)
    };
  }

  function validPoint(modelResult, point) {
    const brow = (modelResult && Array.isArray(modelResult.keypoints) ? modelResult.keypoints : [])
      .find((item) => item && item.key === "brow_center");
    if (!brow || !point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) {
      return { valid: false, reason: "眉心参考点缺失，当前照片不能校正三庭。" };
    }
    const dx = Math.abs(Number(point.x) - Number(brow.x));
    const rise = Number(brow.y) - Number(point.y);
    if (dx > 0.18) return { valid: false, reason: "发际中点应落在眉心上方的中央区域，刚才的位置偏到侧面了。" };
    if (rise < 0.025) return { valid: false, reason: "刚才的位置太接近眉毛，不是发际边缘。" };
    if (rise > 0.34) return { valid: false, reason: "刚才的位置高出面部范围，请点在照片中实际可见的中央发际边缘。" };
    return { valid: true, reason: "" };
  }

  function prepareCorrection(correction) {
    Object.assign(correction, {
      source: "manual_hairline_placement",
      reviewStatus: "pending",
      reviewRounds: 1,
      reviewSource: "local_two_stage_ui",
      sourceRefs: refs.slice(),
      boundaries: ["visible_hairline_in_this_photo", "front_photo_relative_measurement", "not_anatomical_or_medical_measurement"]
    });
    return correction;
  }

  function setPointSource(sample, source) {
    const point = sample && sample.modelResult && Array.isArray(sample.modelResult.keypoints)
      ? sample.modelResult.keypoints.find((item) => item && item.key === "hairline_center")
      : null;
    if (!point) return false;
    point.source = source;
    point.confidence = Math.max(Number(point.confidence || 0), 0.92);
    return true;
  }

  function restoreOriginalHairline(sample) {
    const original = sample && sample.originalModelGeometry && Array.isArray(sample.originalModelGeometry.keypoints)
      ? sample.originalModelGeometry.keypoints.find((item) => item && item.key === "hairline_center")
      : null;
    const current = sample && sample.modelResult && Array.isArray(sample.modelResult.keypoints)
      ? sample.modelResult.keypoints.find((item) => item && item.key === "hairline_center")
      : null;
    if (!original || !current) return false;
    Object.assign(current, original);
    return true;
  }

  function apply(sample, action) {
    const currentReview = review(sample);
    const correction = currentReview.current;
    if (action === "confirm") {
      if (!correction || correction.reviewStatus !== "pending") {
        return { changed: false, restart: false, message: "没有等待确认的发际点。" };
      }
      const pointCheck = validPoint(sample && sample.modelResult, correction.after);
      if (!pointCheck.valid) return { changed: false, restart: true, message: pointCheck.reason };
      correction.reviewStatus = "accepted";
      correction.reviewRounds = 2;
      correction.reviewedAt = new Date().toISOString();
      correction.reviewSource = "local_two_stage_ui";
      setPointSource(sample, "manual_hairline_confirmed");
      return { changed: true, restart: false, message: "发际中点已通过第二轮复核，完整三庭现在可以按这张正脸图计算。" };
    }
    if (action === "redo") {
      if (correction && correction.reviewStatus === "pending") {
        correction.reviewStatus = "disabled";
        correction.reviewedAt = new Date().toISOString();
      }
      return { changed: Boolean(correction), restart: true, message: "请重新点照片中央真实可见的发际边缘。" };
    }
    if (action === "clear") {
      const now = new Date().toISOString();
      hairlineCorrections(sample).forEach((item) => {
        item.reviewStatus = "disabled";
        item.reviewedAt = now;
      });
      const changed = restoreOriginalHairline(sample);
      return { changed, restart: false, message: changed ? "发际点人工校正已清除，完整三庭恢复为待校正。" : "没有可清除的发际点校正。" };
    }
    return { changed: false, restart: false, message: "" };
  }

  function replayable(correction) {
    if (!correction || correction.targetKey !== "hairline_center") return true;
    return correction.reviewStatus === "accepted" && Number(correction.reviewRounds || 0) >= 2;
  }

  function replaySource(correction) {
    return correction && correction.targetKey === "hairline_center"
      ? "manual_hairline_confirmed"
      : "manual_geometry";
  }

  function verifiedSource(source) {
    return source === "manual_geometry" || source === "manual_hairline_confirmed";
  }

  function sourceCounts(points) {
    return (Array.isArray(points) ? points : []).reduce((counts, point) => {
      const source = String(point && point.source || "");
      if (source.startsWith("manual_")) counts.manual += 1;
      else if (source.startsWith("heuristic_geometry")) counts.heuristic += 1;
      else if (source.startsWith("apple_vision_")) counts.native += 1;
      else counts.model += 1;
      return counts;
    }, { manual: 0, native: 0, model: 0, heuristic: 0 });
  }

  function sourceLabel(counts) {
    if (counts.manual && counts.native) return "Apple Vision原生点与人工校正";
    if (counts.native) return counts.model ? "原生与外部模型关键点" : "Apple Vision原生关键点";
    if (counts.manual && counts.model) return "模型与人工混合校正";
    if (counts.manual) return "人工两轮校正";
    if (counts.model) return "外部模型关键点";
    return "启发式参考模板";
  }

  function statusLabel(status) {
    return {
      empty: "等待正脸",
      incomplete: "关键点不全",
      template: "模板待校正",
      low_confidence: "低置信待复核",
      deferred: "质量/视角拒判",
      partial: "部分点已校正",
      lower_measured: "下巴局部可复核",
      measured: "可复核测量"
    }[status] || "待复核";
  }

  function verdictLabel(status) {
    return { short: "偏短", balanced: "接近均衡", long: "偏长", unverified: "待校正" }[status] || "待校正";
  }

  function thresholdSnapshot(thresholds) {
    return { ...thresholds, scope: "visual_review_only", calibration: "reviewed_samples_required", medicalUse: false };
  }

  function classifyLowerCourt(index, thresholds) {
    if (index < thresholds.lowerCourtShortIndex) return "short";
    if (index > thresholds.lowerCourtLongIndex) return "long";
    return "balanced";
  }

  function classifyChinSupport(ratio, thresholds) {
    if (ratio < thresholds.chinSupportShortRatio) return "short";
    if (ratio > thresholds.chinSupportLongRatio) return "long";
    return "balanced";
  }

  function panel(profile, sample) {
    if (!profile || profile.status === "empty") {
      return '<div class="mini-block"><p><b>面部比例</b>：先补完整、平视、没有明显仰俯角的正脸图，再测三庭与下巴支撑段。</p></div>';
    }
    const currentReview = profile.hairlineReview || review(sample);
    const courtText = profile.courtReady && profile.courtRatios
      ? `上庭 ${percent(profile.courtRatios.upper)} · 中庭 ${percent(profile.courtRatios.middle)} · 下庭 ${percent(profile.courtRatios.lower)}`
      : profile.courtRatios ? "三庭参考点已经找到，但发际点还没完成两轮核验，先不分档" : "三庭关键点不完整";
    const chinText = profile.lowerReady && profile.chinSupport
      ? `可见下巴支撑段占下庭 ${percent(profile.chinSupport.chinSupportRatio)} · 唇带占下庭 ${percent(profile.chinSupport.lipBandRatio)}`
      : profile.chinSupport ? "下庭参考点已经找到，但还不能分档" : "口唇与颏点关键点不完整";
    const measured = profile.courtReady && profile.lowerReady;
    const lowerMeasured = profile.lowerReady && profile.chinSupportStatus !== "unverified";
    const tone = measured ? "green" : lowerMeasured || profile.status === "partial" ? "gold" : "";
    const verdict = measured
      ? `下庭 ${profile.lowerCourtStatusLabel}；下巴支撑段 ${profile.chinSupportStatusLabel}；${profile.lipBandStatusLabel}。`
      : lowerMeasured
        ? `完整三庭暂不分档；下巴支撑段 ${profile.chinSupportStatusLabel}；${profile.lipBandStatusLabel}。`
        : "现在看到的数字只是点位参考，不能据此认定下巴偏短或偏长。";
    const pending = currentReview.status === "pending" && profile.courtRatios;
    const pendingText = pending
      ? `<div class="mini-block"><p><b>待你复核的发际点</b>：按这个候选点计算，上庭 ${percent(profile.courtRatios.upper)}、中庭 ${percent(profile.courtRatios.middle)}、下庭 ${percent(profile.courtRatios.lower)}。请确认它确实落在照片中央可见的发际边缘，不是额头阴影或头发覆盖线。</p><div class="button-row"><button class="secondary-action" type="button" data-face-hairline-action="confirm">确认这个点</button><button class="secondary-action" type="button" data-face-hairline-action="redo">重新放点</button><button class="secondary-action" type="button" data-face-hairline-action="clear">清除</button></div></div>`
      : "";
    const limitations = profile.limitations && profile.limitations.length
      ? `<p class="muted">${escapeHtml(profile.limitations.join("；"))}。</p>`
      : "";
    const actionLabel = measured ? "重新校正发际点" : "校正真实发际中点";
    return `
      <div class="mini-block face-proportion-block">
        <p><b>面部比例与下巴</b>：<span class="tag ${tone}">${escapeHtml(profile.statusLabel)}</span> ${escapeHtml(profile.measurementSource)}，关键点覆盖 ${profile.verifiedLandmarkCount}/${profile.requiredLandmarkCount}，证据置信 ${percent(profile.confidence)}。</p>
        <p>${escapeHtml(courtText)}。</p>
        <p>${escapeHtml(chinText)}。</p>
        <p>${escapeHtml(verdict)} ${escapeHtml(profile.lipOcclusion.reason)}</p>
        ${profile.lipOcclusion.possible ? `<div class="tag-row"><span class="tag gold">${escapeHtml(profile.lipOcclusion.label)}</span></div>` : ""}
        ${limitations}
        ${pendingText}
        ${pending ? "" : `<button class="secondary-action" type="button" data-face-proportion-calibrate>${actionLabel}</button>`}
        <p class="muted">这里校正的是这张照片里真实可见的中央发际边缘。分档只比较同一张图的相对比例，不是医学诊断，也不是所有人的统一审美标准。</p>
      </div>
    `;
  }

  global.FaceThirdsRuntime = {
    apply,
    classifyChinSupport,
    classifyLowerCourt,
    panel,
    prepareCorrection,
    replaySource,
    replayable,
    review,
    sanitizeKeypoints,
    sourceCounts,
    sourceLabel,
    statusLabel,
    thresholdSnapshot,
    validPoint,
    verdictLabel,
    verifiedSource
  };
})(typeof window !== "undefined" ? window : globalThis);
