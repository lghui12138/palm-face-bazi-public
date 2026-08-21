(function (root) {
  "use strict";

  const specs = Object.freeze({
    "chin_support:short": "可见下巴承托段偏短候选",
    "chin_support:balanced": "可见下巴承托段在本页常规区间",
    "chin_support:long": "可见下巴承托段偏长候选",
    "lip_band:prominent": "唇带占比较高候选",
    "lip_band:ordinary": "唇带占比未进入较高档",
    "nose_midline:centered": "鼻底中线接近双眼中点",
    "nose_midline:offset_review": "鼻底中线偏移待复核",
    "mouth_midline:centered": "口部中线接近双眼中点",
    "mouth_midline:offset_review": "口部中线偏移待复核",
    "chin_midline:centered": "下巴中线接近双眼中点",
    "chin_midline:offset_review": "下巴中线偏移待复核"
  });
  const allowedRefs = new Set([
    "web.apple-face#output",
    "web.apple-face-quality#score",
    "web.nist-face-quality#factors",
    "web.face-anthropometry#thirds",
    "local.chentai#nose",
    "local.chentai#mouth",
    "local.chentai#chin"
  ]);
  const boundaries = [
    "geometry_observation_only",
    "manual_two_stage_confirmation_required",
    "no_physiognomy_health_personality_fortune_inference"
  ];
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const round = (value) => Math.round((Number(value) || 0) * 1000) / 1000;

  function sanitize(item, stripReview) {
    const candidateKey = String(item && item.candidateKey || "");
    const label = specs[candidateKey];
    const score = Number(item && item.score);
    if (!label || !Number.isFinite(score) || score < 0 || score > 0.84 || item.traditionalStatusAllowed !== false) return null;
    const measurement = item.measurement && typeof item.measurement === "object"
      ? Object.fromEntries(Object.entries(item.measurement).filter(([, value]) => ["string", "number"].includes(typeof value) || value && typeof value === "object"))
      : {};
    const result = {
      key: candidateKey.split(":")[0],
      value: candidateKey.split(":")[1],
      candidateKey,
      label,
      score: round(score),
      measurement,
      reasons: Array.isArray(item.reasons) ? item.reasons.slice(0, 3).map(String) : [],
      source: "native_face_geometry_observer_v1",
      sourceRefs: Array.isArray(item.sourceRefs) ? item.sourceRefs.filter((ref) => allowedRefs.has(ref)).slice(0, 4) : [],
      validatedClassifier: false,
      reviewRequired: true,
      traditionalStatusAllowed: false,
      autoConfirmed: false,
      boundaries
    };
    if (!stripReview && validReview(item.review)) result.review = { ...item.review };
    return result;
  }

  function validReview(review) {
    return Boolean(review && ["proposed", "confirmed", "rejected"].includes(review.status) && review.source === "local_two_stage_ui");
  }

  function normalize(items) {
    return (Array.isArray(items) ? items : []).map((item) => sanitize(item, true)).filter(Boolean).slice(0, 5);
  }

  function primaryValue(candidate) {
    const measurement = candidate && candidate.measurement;
    if (!measurement || typeof measurement !== "object") return null;
    const value = Number(measurement.absoluteValue ?? measurement.value);
    return Number.isFinite(value) ? value : null;
  }

  function preserve(previous, next) {
    const oldMap = new Map((Array.isArray(previous) ? previous : []).map((item) => [item && item.candidateKey, item]));
    return (Array.isArray(next) ? next : []).map((item) => {
      const clean = sanitize(item, true);
      if (!clean) return null;
      const old = oldMap.get(clean.candidateKey);
      if (!old || !validReview(old.review)) return clean;
      const before = primaryValue(old);
      const after = primaryValue(clean);
      const tolerance = clean.key.endsWith("midline") ? 0.035 : 0.04;
      if (before === null || after === null || Math.abs(before - after) > tolerance) return clean;
      return { ...clean, review: { ...old.review, preservedAt: new Date().toISOString() } };
    }).filter(Boolean);
  }

  function findCandidate(samples, sampleId, candidateKey) {
    const sample = (Array.isArray(samples) ? samples : []).find((item) => String(item && (item.id || item.name || "")) === String(sampleId || ""));
    const candidates = sample && sample.modelResult && sample.modelResult.faceObservationCandidates;
    const candidate = Array.isArray(candidates) ? candidates.find((item) => item.candidateKey === candidateKey) : null;
    return candidate ? { sample, candidate } : null;
  }

  function apply(samples, sampleId, candidateKey, action) {
    const found = findCandidate(samples, sampleId, candidateKey);
    if (!found) return { changed: false, message: "没有找到这条面部观察候选。" };
    const now = new Date().toISOString();
    const current = validReview(found.candidate.review) ? found.candidate.review : null;
    if (action === "propose") {
      found.candidate.review = { status: "proposed", source: "local_two_stage_ui", reviewRounds: 1, proposedAt: now };
      return { changed: true, message: `已初审接受“${found.candidate.label}”，还需再看原图完成复核。` };
    }
    if (action === "confirm" && current && current.status === "proposed") {
      found.candidate.review = { ...current, status: "confirmed", reviewRounds: 2, confirmedAt: now };
      return { changed: true, message: `已二次确认“${found.candidate.label}”，现已进入面部观察真值。` };
    }
    if (action === "reject") {
      found.candidate.review = { status: "rejected", source: "local_two_stage_ui", reviewRounds: 1, rejectedAt: now };
      return { changed: true, message: `已拒绝“${found.candidate.label}”，不会进入训练记录。` };
    }
    if (action === "clear" || action === "restore") {
      delete found.candidate.review;
      return { changed: true, message: `已将“${found.candidate.label}”恢复为待审。` };
    }
    return { changed: false, message: "复核顺序不完整，请先做初审。" };
  }

  function status(candidate) {
    return validReview(candidate.review) ? candidate.review.status : "unreviewed";
  }

  function actionHtml(sampleId, candidate) {
    const state = status(candidate);
    const attr = `data-face-observation-sample-id="${escapeHtml(sampleId)}" data-face-observation-key="${escapeHtml(candidate.candidateKey)}"`;
    if (state === "proposed") return `<button class="secondary-action compact-action" type="button" data-face-observation-action="confirm" ${attr}>复核确认</button><button class="secondary-action compact-action" type="button" data-face-observation-action="clear" ${attr}>清除</button>`;
    if (state === "confirmed") return `<button class="secondary-action compact-action" type="button" data-face-observation-action="propose" ${attr}>重新初审</button><button class="secondary-action compact-action" type="button" data-face-observation-action="clear" ${attr}>清除</button>`;
    if (state === "rejected") return `<button class="secondary-action compact-action" type="button" data-face-observation-action="restore" ${attr}>恢复待审</button>`;
    return `<button class="secondary-action compact-action" type="button" data-face-observation-action="propose" ${attr}>初审接受</button><button class="secondary-action compact-action" type="button" data-face-observation-action="reject" ${attr}>拒绝候选</button>`;
  }

  function panel(samples) {
    const rows = (Array.isArray(samples) ? samples : []).flatMap((sample) => {
      const candidates = sample && sample.modelResult && Array.isArray(sample.modelResult.faceObservationCandidates)
        ? sample.modelResult.faceObservationCandidates
        : [];
      const sampleId = sample && (sample.id || sample.name || "");
      return candidates.map((candidate) => ({ sample, sampleId, candidate }));
    });
    if (!rows.length) return "";
    const statusLabels = { unreviewed: "待审", proposed: "已初审", confirmed: "已复核", rejected: "已拒绝" };
    return `<div class="mini-block face-observation-block">
      <p><b>面部几何观察候选</b>：原生关键点共形成 ${rows.length} 条可核对观察。确认的是照片里的比例和相对位置，不是人格、财运、健康或寿命结论。</p>
      <div class="face-observation-list">${rows.map(({ sample, sampleId, candidate }) => {
        const state = status(candidate);
        const reason = (candidate.reasons || []).join("；");
        return `<div class="face-observation-row">
          <div><strong>${escapeHtml(sample.label || sample.name || "面照")} · ${escapeHtml(candidate.label)}</strong><span class="tag ${state === "confirmed" ? "green" : state === "rejected" ? "red" : "gold"}">${statusLabels[state]}</span><p class="muted">几何证据 ${Math.round(Number(candidate.score || 0) * 100)}%：${escapeHtml(reason)}</p></div>
          <div class="face-observation-actions">${actionHtml(sampleId, candidate)}</div>
        </div>`;
      }).join("")}</div>
    </div>`;
  }

  function trainingItems(samples, context = {}) {
    return (Array.isArray(samples) ? samples : []).flatMap((sample) => {
      const candidates = sample && sample.modelResult && Array.isArray(sample.modelResult.faceObservationCandidates)
        ? sample.modelResult.faceObservationCandidates
        : [];
      return candidates.filter((candidate) => validReview(candidate.review) && candidate.review.status === "confirmed" && candidate.review.reviewRounds >= 2).map((candidate) => {
        const provenance = sample.sampleProvenance && typeof sample.sampleProvenance === "object" ? sample.sampleProvenance : {};
        return {
          id: `${context.source || "session"}:face:${sample.name || "sample"}:observation:${candidate.candidateKey}`,
          correctionKey: `face_observation|${candidate.candidateKey}|${candidate.review.confirmedAt || "confirmed"}`,
          source: context.source || "current_session",
          mode: "face",
          caseId: context.caseId || null,
          caseTitle: context.caseTitle || null,
          caseCreatedAt: context.caseCreatedAt || null,
          sampleName: sample.name || "",
          sampleType: sample.type || "",
          suggestedType: sample.suggestedType || "",
          quality: sample.quality ?? null,
          modelVersion: sample.modelVersion || "",
          targetKind: "face_observation",
          targetKey: candidate.candidateKey,
          endpoint: null,
          before: null,
          after: null,
          correctedAt: candidate.review.confirmedAt || null,
          reviewStatus: "accepted",
          reviewedAt: candidate.review.confirmedAt || null,
          feedback: context.feedback || null,
          sampleProvenance: provenance,
          subjectKey: provenance.subjectKey || null,
          independenceEligible: Boolean(provenance.independenceEligible),
          targetSnapshot: {
            candidateKey: candidate.candidateKey,
            label: candidate.label,
            score: candidate.score,
            measurement: candidate.measurement,
            reasons: candidate.reasons,
            reviewRounds: 2,
            sourceRefs: candidate.sourceRefs,
            traditionalStatusAllowed: false
          },
          boundaries
        };
      });
    });
  }

  function targetLabel(key) {
    return specs[key] || "";
  }

  function evidence(item) {
    const measurement = item && item.targetSnapshot && item.targetSnapshot.measurement;
    const value = measurement && Number.isFinite(Number(measurement.value)) ? Number(measurement.value).toFixed(3) : "--";
    return `二阶段人工确认 · 实测值 ${value} · 仅作照片几何观察`;
  }

  root.FaceObservationRuntime = Object.freeze({ normalize, preserve, apply, panel, trainingItems, targetLabel, evidence });
})(globalThis);
